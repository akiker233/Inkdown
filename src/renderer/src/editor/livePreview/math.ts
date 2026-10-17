import type { SpanRange } from './spans'

/**
 * `$...$` / `$$...$$` 不在 Lezer 的 Markdown 语法树里，只能按文本扫描。
 * 规则刻意保守（宁可少渲染，也不把 "$5 和 $10" 当成公式）：
 * - 开 `$` 后不能是空白或另一个 `$`
 * - 闭 `$` 前不能是空白，后不能是数字
 * - 行内公式不跨行；代码、图片、链接区间整体排除
 */

export interface MathItem {
  kind: 'inline' | 'block'
  from: number
  to: number
  tex: string
  display: boolean
}

export interface TextSlice {
  length: number
  slice(from: number, to: number): string
}

export interface MathScanArgs {
  text: TextSlice
  from: number
  to: number
  excluded: readonly SpanRange[]
}

const BLOCK_MULTI = /^[ \t]*\$\$[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\$\$[ \t]*(?=\r?$)/gm
const BLOCK_SINGLE = /^[ \t]*\$\$([^$\r\n]+?)\$\$[ \t]*(?=\r?$)/gm

function intersects(a: SpanRange, b: SpanRange): boolean {
  return a.from < b.to && a.to > b.from
}

function isBlocked(range: SpanRange, excluded: readonly SpanRange[]): boolean {
  return excluded.some((blocked) => intersects(range, blocked))
}

export function collectMathItems({ text, from, to, excluded }: MathScanArgs): MathItem[] {
  const source = text.slice(from, to)
  const items: MathItem[] = []
  const spans: SpanRange[] = []

  const scanBlock = (re: RegExp): void => {
    re.lastIndex = 0
    for (let match = re.exec(source); match; match = re.exec(source)) {
      const start = from + match.index
      const end = start + match[0].length
      if (spans.some((existing) => intersects({ from: start, to: end }, existing))) continue
      if (isBlocked({ from: start, to: end }, excluded)) continue
      const tex = match[1].trim()
      if (!tex) continue
      spans.push({ from: start, to: end })
      items.push({ kind: 'block', from: start, to: end, tex, display: true })
    }
  }

  scanBlock(BLOCK_MULTI)
  scanBlock(BLOCK_SINGLE)

  // 行内扫描：跳过转义、块公式和排除区间
  const blocked = [...excluded, ...spans]
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char !== '$' || source[index + 1] === '$') {
      index += 1
      continue
    }

    const next = source[index + 1]
    if (!next || /\s/.test(next)) {
      index += 1
      continue
    }

    let close = index + 1
    let closed = false
    while (close < source.length) {
      const current = source[close]
      if (current === '\\') {
        close += 2
        continue
      }
      if (current === '\n') break
      if (current === '$') {
        const before = source[close - 1]
        const after = source[close + 1]
        if (before && !/\s/.test(before) && !(after && /[0-9]/.test(after)) && before !== '$') {
          closed = true
          break
        }
      }
      close += 1
    }

    if (!closed) {
      index += 1
      continue
    }

    const range = { from: from + index, to: from + close + 1 }
    if (isBlocked(range, blocked)) {
      index = close + 1
      continue
    }

    const tex = source.slice(index + 1, close)
    if (!tex.trim()) {
      index = close + 1
      continue
    }
    spans.push(range)
    items.push({ kind: 'inline', from: range.from, to: range.to, tex, display: false })
    index = close + 1
  }

  return items.sort((a, b) => a.from - b.from)
}
