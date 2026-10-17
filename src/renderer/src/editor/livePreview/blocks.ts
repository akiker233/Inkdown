import type { SyntaxNode, Tree } from '@lezer/common'
import type { SpanRange, TextSource } from './spans'
import { resolveImageSrc } from './imageSrc'
import { parseTable, type ParsedTable } from './tableModel'

/**
 * 块级即时渲染的纯逻辑层。
 *
 * 与行内层同一原则：只隐藏标记，不搬动内容。
 * 被整体替换的只有"无法编辑的装饰物"（分割线、图片、任务复选框、代码围栏、公式），
 * 其余文本始终留在文档里，光标、撤销、IME 全部由 CodeMirror 负责。
 */

export type BlockWidgetPayload =
  | { kind: 'bullet'; depth: number }
  | { kind: 'task'; checked: boolean; marker: SpanRange }
  | { kind: 'hr'; source: SpanRange }
  | { kind: 'image'; src: string; rawSrc: string; alt: string; source: SpanRange }
  | {
      kind: 'code-header'
      lang: string
      info: SpanRange
      code: SpanRange
      source: SpanRange
    }
  | { kind: 'code-lineno'; number: number }
  | { kind: 'math'; tex: string; display: boolean; source: SpanRange }
  | {
      kind: 'table'
      model: ParsedTable['model']
      cells: ParsedTable['cells']
      source: SpanRange
    }
  | { kind: 'mermaid'; code: string; source: SpanRange; codeFrom: number }

export interface BlockDecoration {
  kind: 'replace' | 'line' | 'mark' | 'widget'
  from: number
  to: number
  className?: string
  widget?: BlockWidgetPayload
  side?: -1 | 1
  block?: boolean
}

export interface BlockParseResult {
  decorations: BlockDecoration[]
  /** 代码 / 图片等区域，供公式扫描排除 */
  excluded: SpanRange[]
  /** 真正被 replace 的区间，供 atomicRanges 使用 */
  atomic: SpanRange[]
}

const ATX_RE = /^ATXHeading([1-6])$/
const SETEXT_RE = /^SetextHeading([12])$/
const ORDERED_MARK_RE = /^\d+[.)]$/

/**
 * 光标"进入"某块的判定。
 * 折叠光标在区间端点上也算进入（否则点标题行首会看不到源码）；
 * 有选区时严格相交，避免从下一行按 ↑ 到边界就把整块炸开。
 */
export function isRegionActive(
  region: SpanRange,
  selection: readonly SpanRange[]
): boolean {
  return selection.some((range) => {
    if (range.from === range.to) return range.from >= region.from && range.from <= region.to
    return range.from < region.to && range.to > region.from
  })
}

function directChildren(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) children.push(child)
  return children
}

function collectDescendants(node: SyntaxNode, name: string, out: SpanRange[]): void {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) out.push({ from: child.from, to: child.to })
    collectDescendants(child, name, out)
  }
}

function listDepth(node: SyntaxNode): number {
  let depth = 0
  for (let current: SyntaxNode | null = node; current; current = current.parent) {
    if (current.name === 'ListItem') depth += 1
    if (current.name === 'Document') break
  }
  return depth
}

export function collectBlockDecorations(args: {
  tree: Tree
  text: TextSource
  from: number
  to: number
  selection: readonly SpanRange[]
  docPath: string
}): BlockParseResult {
  const { tree, text, from, to, selection, docPath } = args
  const source = text.slice(from, to)
  const base = from

  const rel = (pos: number): number => Math.min(Math.max(pos - base, 0), source.length)
  const charAt = (pos: number): string => source[rel(pos)]

  const lineStart = (pos: number): number => {
    const index = source.lastIndexOf('\n', rel(pos) - 1)
    return index < 0 ? base : base + index + 1
  }

  const lineEnd = (pos: number): number => {
    const index = source.indexOf('\n', rel(pos))
    return index < 0 ? base + source.length : base + index
  }

  const skipSpaces = (pos: number, direction: 1 | -1): number => {
    let next = pos
    if (direction === 1) {
      while (next < lineEnd(next) && (charAt(next) === ' ' || charAt(next) === '\t')) next += 1
    } else {
      while (next > lineStart(next) && (charAt(next - 1) === ' ' || charAt(next - 1) === '\t')) {
        next -= 1
      }
    }
    return next
  }

  const decorations: BlockDecoration[] = []
  const excluded: SpanRange[] = []
  const atomic: SpanRange[] = []
  const replaceKeys = new Set<string>()
  const markKeys = new Set<string>()
  const lineClasses = new Map<number, Set<string>>()

  const addLineClass = (pos: number, className: string): void => {
    const classes = lineClasses.get(pos) ?? new Set<string>()
    for (const name of className.split(/\s+/)) if (name) classes.add(name)
    lineClasses.set(pos, classes)
  }

  const replaceRange = (
    start: number,
    end: number,
    widget?: BlockWidgetPayload,
    options?: { block?: boolean }
  ): void => {
    if (end < start) return
    if (end === start && !widget) return
    const key = `${start}:${end}:${widget?.kind ?? 'none'}`
    if (replaceKeys.has(key)) return
    replaceKeys.add(key)
    decorations.push({ kind: 'replace', from: start, to: end, widget, block: options?.block })
    atomic.push({ from: start, to: end })
  }

  const addMark = (start: number, end: number, className: string): void => {
    if (end <= start) return
    const key = `${start}:${end}:${className}`
    if (markKeys.has(key)) return
    markKeys.add(key)
    decorations.push({ kind: 'mark', from: start, to: end, className })
  }

  const insertWidget = (pos: number, widget: BlockWidgetPayload, side: -1 | 1 = -1): void => {
    decorations.push({ kind: 'widget', from: pos, to: pos, widget, side })
  }

  tree.iterate({
    from,
    to,
    enter: (ref) => {
      // 跨越可视窗口的大节点只渲染窗口内能确定的部分，避免坐标系越界
      if (ref.from < from && ref.name !== 'Document') return false

      const name = ref.name

      const atx = ATX_RE.exec(name)
      if (atx) {
        const line = lineStart(ref.from)
        const end = lineEnd(ref.from)
        const level = atx[1]
        addLineClass(line, `md-heading-line md-h${level}-line`)

        if (!isRegionActive({ from: line, to: end }, selection)) {
          const marks = directChildren(ref.node).filter((child) => child.name === 'HeaderMark')
          if (marks.length > 0) {
            const open = marks[0]
            replaceRange(open.from, skipSpaces(open.to, 1))
            if (marks.length > 1) {
              const close = marks[marks.length - 1]
              replaceRange(skipSpaces(close.from, -1), close.to)
            }
          }
        }
        return false
      }

      const setext = SETEXT_RE.exec(name)
      if (setext) {
        const level = setext[1]
        addLineClass(lineStart(ref.from), `md-heading-line md-h${level}-line`)
        if (!isRegionActive({ from: ref.from, to: ref.to }, selection)) {
          const underline = directChildren(ref.node).find((child) => child.name === 'HeaderMark')
          if (underline) {
            const line = lineStart(underline.from)
            replaceRange(line, lineEnd(underline.from))
            addLineClass(line, 'md-hidden-line')
          }
        }
        return false
      }

      if (name === 'HorizontalRule') {
        const line = lineStart(ref.from)
        const end = lineEnd(ref.from)
        addLineClass(line, 'md-hr-line')
        if (!isRegionActive({ from: line, to: end }, selection)) {
          replaceRange(line, end, {
            kind: 'hr',
            source: { from: ref.from, to: ref.to }
          })
        }
        return false
      }

      if (name === 'Image') {
        const range = { from: ref.from, to: ref.to }
        excluded.push(range)
        if (!isRegionActive(range, selection)) {
          const children = directChildren(ref.node)
          const marks = children.filter((child) => child.name === 'LinkMark')
          const url = children.find((child) => child.name === 'URL')
          if (url && marks.length >= 2) {
            const rawSrc = text.slice(url.from, url.to)
            replaceRange(ref.from, ref.to, {
              kind: 'image',
              src: resolveImageSrc(rawSrc, docPath),
              rawSrc,
              alt: text.slice(marks[0].to, marks[1].from),
              source: range
            })
          }
        }
        return false
      }

      if (name === 'Table') {
        const range = { from: ref.from, to: ref.to }
        if (isRegionActive(range, selection)) return false

        // 引用 / 列表里的表格带前缀标记，整行替换会吞掉前缀，先退回源码
        if (text.slice(lineStart(ref.from), ref.from).trim()) return false

        // 解析失败一律退回源码：宁可不渲染，也不把表格改坏
        const parsed = parseTable(text.slice(range.from, range.to), range.from)
        if (!parsed) return false

        excluded.push(range)
        const first = lineStart(ref.from)
        addLineClass(first, 'md-table-first')
        replaceRange(first, lineEnd(ref.from), {
          kind: 'table',
          model: parsed.model,
          cells: parsed.cells,
          source: range
        })

        // 多行表格不能跨行 replace：首行承载 widget，其余行清空并折叠高度
        let line = lineEnd(ref.from) + 1
        while (line <= range.to) {
          const end = Math.min(lineEnd(line), range.to)
          if (end > line) replaceRange(line, end)
          addLineClass(line, 'md-hidden-line')
          if (end >= range.to) break
          line = end + 1
        }
        return false
      }

      if (name === 'FencedCode') {
        const end = Math.min(ref.to, to)
        excluded.push({ from: ref.from, to: end })

        const children = directChildren(ref.node)
        const marks = children.filter((child) => child.name === 'CodeMark')
        const closeMark = marks.length > 1 ? marks[marks.length - 1] : null
        const close = closeMark && closeMark.from <= to ? closeMark : null
        const info = children.find((child) => child.name === 'CodeInfo')

        const openLine = lineStart(ref.from)
        const openEnd = lineEnd(ref.from)
        const closeLine = close ? lineStart(close.from) : null
        const codeFrom = Math.min(openEnd + 1, text.length)
        const codeTo = closeLine !== null ? Math.max(codeFrom, closeLine - 1) : end

        const lang = info ? text.slice(info.from, info.to).trim().split(/\s+/)[0] ?? '' : ''

        // mermaid 围栏在非激活态整块折叠为图表；光标进入后回退成普通代码块
        if (lang.toLowerCase() === 'mermaid' && close && codeTo > codeFrom) {
          const source = { from: ref.from, to: end }
          if (!isRegionActive(source, selection)) {
            addLineClass(openLine, 'md-mermaid-first')
            replaceRange(openLine, openEnd, {
              kind: 'mermaid',
              code: text.slice(codeFrom, codeTo),
              source,
              codeFrom
            })
            let line = codeFrom
            while (line <= end) {
              const lineTo = Math.min(lineEnd(line), end)
              if (lineTo > line) replaceRange(line, lineTo)
              addLineClass(line, 'md-hidden-line')
              if (lineTo >= end) break
              line = lineTo + 1
            }
            return false
          }
        }

        addLineClass(openLine, 'md-code-first')
        replaceRange(openLine, openEnd, {
          kind: 'code-header',
          lang,
          info: info ? { from: info.from, to: info.to } : { from: openEnd, to: openEnd },
          code: { from: codeFrom, to: codeTo },
          source: { from: ref.from, to: end }
        })

        let line = codeFrom
        let lineNo = 1
        let lastCodeLine = -1
        const codeLimit = closeLine ?? Number.POSITIVE_INFINITY
        while (line < codeLimit && line <= codeTo && line <= end) {
          const lineTo = Math.min(lineEnd(line), codeTo)
          addLineClass(line, 'md-code-line')
          insertWidget(line, { kind: 'code-lineno', number: lineNo })
          lastCodeLine = line
          if (lineTo >= codeTo) break
          line = lineTo + 1
          lineNo += 1
        }

        if (closeLine !== null && close) {
          addLineClass(closeLine, 'md-hidden-line md-code-fence-close')
          addLineClass(lastCodeLine >= 0 ? lastCodeLine : openLine, 'md-code-last')
          replaceRange(closeLine, lineEnd(close.from))
        } else if (lastCodeLine < 0) {
          addLineClass(openLine, 'md-code-last')
        } else {
          addLineClass(lastCodeLine, 'md-code-last')
        }

        return false
      }

      if (name === 'CodeBlock') {
        const end = Math.min(ref.to, to)
        excluded.push({ from: ref.from, to: end })

        let line = lineStart(ref.from)
        let lineNo = 1
        let first = true
        while (line <= end) {
          const lineTo = Math.min(lineEnd(line), end)
          addLineClass(line, first ? 'md-code-line md-code-indented-first' : 'md-code-line')
          insertWidget(line, { kind: 'code-lineno', number: lineNo })
          if (lineTo >= end) {
            addLineClass(line, 'md-code-last')
            break
          }
          first = false
          line = lineTo + 1
          lineNo += 1
        }
        return false
      }

      if (name === 'Blockquote') {
        const quoteMarks: SpanRange[] = []
        collectDescendants(ref.node, 'QuoteMark', quoteMarks)

        const depthByLine = new Map<number, number>()
        for (const mark of quoteMarks) {
          const line = lineStart(mark.from)
          depthByLine.set(line, (depthByLine.get(line) ?? 0) + 1)
          if (!isRegionActive({ from: line, to: lineEnd(mark.from) }, selection)) {
            replaceRange(mark.from, skipSpaces(mark.to, 1))
          }
        }

        const lastLine = lineStart(Math.min(ref.to, to))
        let line = lineStart(ref.from)
        while (line <= lastLine) {
          const depth = Math.min(Math.max(depthByLine.get(line) ?? 1, 1), 4)
          addLineClass(line, `md-quote-line md-quote-depth-${depth}`)
          const lineTo = lineEnd(line)
          if (lineTo >= to) break
          line = lineTo + 1
        }
        return
      }

      if (name === 'ListItem') {
        const children = directChildren(ref.node)
        const listMark = children.find((child) => child.name === 'ListMark')
        if (!listMark) return

        const line = lineStart(listMark.from)
        const active = isRegionActive({ from: line, to: lineEnd(listMark.from) }, selection)
        const markerText = text.slice(listMark.from, listMark.to)
        const ordered = ORDERED_MARK_RE.test(markerText)
        const task = children.find((child) => child.name === 'Task')
        const taskMarker = task
          ? directChildren(task).find((child) => child.name === 'TaskMarker')
          : undefined

        if (ordered) addMark(listMark.from, listMark.to, 'md-list-number')

        if (taskMarker) {
          addLineClass(line, 'md-list-line md-task-line')
          if (!active) {
            const widget: BlockWidgetPayload = {
              kind: 'task',
              checked: /\[[xX]\]/.test(text.slice(taskMarker.from, taskMarker.to)),
              marker: { from: taskMarker.from, to: taskMarker.to }
            }
            // 无序任务把 "- [ ]" 整体换成复选框；有序任务保留编号
            if (ordered) replaceRange(taskMarker.from, taskMarker.to, widget)
            else replaceRange(listMark.from, taskMarker.to, widget)
          }
        } else {
          addLineClass(line, 'md-list-line')
          if (!ordered && !active) {
            replaceRange(listMark.from, listMark.to, {
              kind: 'bullet',
              depth: listDepth(ref.node)
            })
          }
        }
        return
      }

      return
    }
  })

  for (const [pos, classes] of [...lineClasses.entries()].sort((a, b) => a[0] - b[0])) {
    decorations.push({ kind: 'line', from: pos, to: pos, className: [...classes].join(' ') })
  }

  return { decorations, excluded, atomic }
}
