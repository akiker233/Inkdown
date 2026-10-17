import type { SyntaxNode, Tree } from '@lezer/common'

/**
 * 行内即时渲染的纯逻辑层：只负责从语法树里算出
 * 「哪些标记该藏、哪些内容该套什么类」，不依赖 EditorView。
 *
 * 这样 decorationBuilder 可以在 vitest 里直接用 @lezer/markdown 的同一棵语法树验证，
 * 也保证插件侧永远只做很薄的装配。
 */

export type InlineKind =
  | 'strong'
  | 'em'
  | 'strike'
  | 'code'
  | 'link'
  | 'autolink'
  | 'wiki'
  | 'highlight'

export interface SpanRange {
  from: number
  to: number
}

export interface InlineSpan {
  kind: InlineKind
  /** 整个语法结构的范围（Wiki 链接包含外层方括号），用于判断 activeRegion */
  from: number
  to: number
  /** 隐藏后消失的标记区间；atomicRanges 只允许包含这些区间 */
  markers: SpanRange[]
  /** 保留下来的可见内容范围 */
  content: SpanRange
  className: string
}

export interface DecorationSpec extends SpanRange {
  kind: 'replace' | 'mark'
  className?: string
}

export interface TextSource {
  length: number
  slice(from: number, to: number): string
}

const CLASSES: Record<InlineKind, string> = {
  strong: 'md-strong',
  em: 'md-em',
  strike: 'md-del',
  code: 'md-code',
  link: 'md-link',
  autolink: 'md-link',
  wiki: 'md-wikilink',
  highlight: 'md-mark'
}

const BLOCK_SKIP = new Set(['FencedCode', 'CodeBlock', 'HTMLBlock'])
const HIGHLIGHT_RE = /(?<!=)==([^=\r\n]+?)==(?!=)/g

export function sourceOf(text: string): TextSource {
  return {
    length: text.length,
    slice: (from, to) => text.slice(Math.max(0, from), Math.min(text.length, to))
  }
}

export function isSpanActive(span: InlineSpan, selection: readonly SpanRange[]): boolean {
  return selection.some((range) => range.from < span.to && range.to > span.from)
}

function directChildren(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) children.push(child)
  return children
}

function makeSpan(
  kind: InlineKind,
  from: number,
  to: number,
  markers: SpanRange[],
  content: SpanRange
): InlineSpan {
  return { kind, from, to, markers, content, className: CLASSES[kind] }
}

function intersects(a: SpanRange, b: SpanRange): boolean {
  return a.from < b.to && a.to > b.from
}

function isEscaped(text: TextSource, index: number): boolean {
  let backslashes = 0
  for (let i = index - 1; i >= 0 && text.slice(i, i + 1) === '\\'; i -= 1) backslashes += 1
  return backslashes % 2 === 1
}

/**
 * 只遍历给定区间（插件按视口 ±200 行传入），
 * 同时收集需要排除出 `==高亮==` 扫描的代码 / 链接区间。
 */
export function collectInlineSpans(args: {
  tree: Tree
  text: TextSource
  from: number
  to: number
  /** 额外的排除区间；函数也会把代码 / 链接 / 图片追加进去，供公式扫描复用 */
  excluded?: SpanRange[]
}): InlineSpan[] {
  const { tree, text, from, to } = args
  const spans: InlineSpan[] = []
  const excluded = args.excluded ?? []

  tree.iterate({
    from,
    to,
    enter: (ref) => {
      const name = ref.name

      if (BLOCK_SKIP.has(name)) {
        excluded.push({ from: ref.from, to: ref.to })
        return false
      }

      if (name === 'InlineCode') {
        excluded.push({ from: ref.from, to: ref.to })
        const marks = directChildren(ref.node).filter((child) => child.name === 'CodeMark')
        if (marks.length >= 2) {
          spans.push(
            makeSpan(
              'code',
              ref.from,
              ref.to,
              [
                { from: marks[0].from, to: marks[0].to },
                { from: marks[marks.length - 1].from, to: marks[marks.length - 1].to }
              ],
              { from: marks[0].to, to: marks[marks.length - 1].from }
            )
          )
        }
        return false
      }

      // 图片语法留到 M3 的图片本地化一起处理，这里不做任何替换
      if (name === 'Image') {
        excluded.push({ from: ref.from, to: ref.to })
        return false
      }

      if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough') {
        const markName = name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark'
        const marks = directChildren(ref.node).filter((child) => child.name === markName)
        if (marks.length >= 2) {
          const kind = name === 'StrongEmphasis' ? 'strong' : name === 'Emphasis' ? 'em' : 'strike'
          spans.push(
            makeSpan(
              kind,
              ref.from,
              ref.to,
              [
                { from: marks[0].from, to: marks[0].to },
                { from: marks[marks.length - 1].from, to: marks[marks.length - 1].to }
              ],
              { from: marks[0].to, to: marks[marks.length - 1].from }
            )
          )
        }
        // 不返回 false：链接里嵌套的强调也要处理
        return
      }

      if (name === 'Link') {
        const linkMarks = directChildren(ref.node).filter((child) => child.name === 'LinkMark')
        if (linkMarks.length >= 2) {
          let span: InlineSpan | null = null
          const labelStart = linkMarks[0].to
          const labelEnd = linkMarks[1].from

          // [[target|显示]] 会被 Lezer 当作 shortcut reference link 解析，
          // 靠外层的第二对方括号识别成 Wiki 链接。
          if (
            ref.from > 0 &&
            text.slice(ref.from - 1, ref.from) === '[' &&
            text.slice(ref.to, ref.to + 1) === ']' &&
            text.slice(ref.from, ref.from + 1) === '[' &&
            text.slice(ref.to - 1, ref.to) === ']'
          ) {
            const inner = text.slice(ref.from + 1, ref.to - 1)
            const pipe = inner.indexOf('|')
            const contentFrom = pipe >= 0 ? ref.from + 1 + pipe + 1 : ref.from + 1
            span = makeSpan(
              'wiki',
              ref.from - 1,
              ref.to + 1,
              [
                { from: ref.from - 1, to: contentFrom },
                { from: ref.to - 1, to: ref.to + 1 }
              ],
              { from: contentFrom, to: ref.to - 1 }
            )
          } else {
            span = makeSpan(
              'link',
              ref.from,
              ref.to,
              [
                { from: ref.from, to: labelStart },
                { from: labelEnd, to: ref.to }
              ],
              { from: labelStart, to: labelEnd }
            )
          }

          spans.push(span)
          excluded.push({ from: ref.from, to: ref.to })
        }
        return
      }

      if (name === 'Autolink') {
        const marks = directChildren(ref.node).filter((child) => child.name === 'LinkMark')
        if (marks.length >= 2) {
          spans.push(
            makeSpan(
              'autolink',
              ref.from,
              ref.to,
              [
                { from: marks[0].from, to: marks[0].to },
                { from: marks[marks.length - 1].from, to: marks[marks.length - 1].to }
              ],
              { from: marks[0].to, to: marks[marks.length - 1].from }
            )
          )
        }
        excluded.push({ from: ref.from, to: ref.to })
        return false
      }

      return
    }
  })

  // 高亮不是 CommonMark/GFM 语法，用严格的正则在剩余文本里补扫。
  const source = text.slice(from, to)
  HIGHLIGHT_RE.lastIndex = 0
  for (let match = HIGHLIGHT_RE.exec(source); match; match = HIGHLIGHT_RE.exec(source)) {
    const start = from + match.index
    const end = start + match[0].length
    const range = { from: start, to: end }
    if (isEscaped(text, start)) continue
    if (excluded.some((blocked) => intersects(range, blocked))) continue
    spans.push(
      makeSpan(
        'highlight',
        start,
        end,
        [
          { from: start, to: start + 2 },
          { from: end - 2, to: end }
        ],
        { from: start + 2, to: end - 2 }
      )
    )
  }

  return spans.sort((a, b) => a.from - b.from || a.to - b.to)
}

/**
 * 把 span 编译成 CodeMirror 可消费的规格：
 * - 内容永远套 class（源码模式不经过这里，标记由 highlightStyle 处理）
 * - 标记只在 activeRegion 之外才 replace 掉
 * - atomic 只收 replace 区间，绝不把内容也变原子
 */
export function buildDecorationSpecs(
  spans: readonly InlineSpan[],
  selection: readonly SpanRange[]
): { decorations: DecorationSpec[]; atomic: SpanRange[] } {
  const decorations: DecorationSpec[] = []
  const atomic: SpanRange[] = []
  const atomicKeys = new Set<string>()

  for (const span of spans) {
    if (span.content.to > span.content.from) {
      decorations.push({
        kind: 'mark',
        from: span.content.from,
        to: span.content.to,
        className: span.className
      })
    }

    if (isSpanActive(span, selection)) continue

    for (const marker of span.markers) {
      if (marker.to <= marker.from) continue
      decorations.push({ kind: 'replace', from: marker.from, to: marker.to })
      const key = `${marker.from}:${marker.to}`
      if (!atomicKeys.has(key)) {
        atomicKeys.add(key)
        atomic.push(marker)
      }
    }
  }

  return { decorations, atomic }
}
