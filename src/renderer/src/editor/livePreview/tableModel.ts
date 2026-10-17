import type { SpanRange } from './spans'

/**
 * Markdown 表格的唯一写入口。
 *
 * 不直接用 Lezer 的 Table 节点切单元格：GFM 里 `\|` 与代码跨度内的 `|`
 * 不参与分列，而语法树会把它们切开。这里自己按行扫描，保证解析、序列化、
 * 行列操作和光标定位使用同一套规则；解析失败时返回 null，调用方退回源码显示。
 */

export type TableAlign = 'none' | 'left' | 'center' | 'right'

export interface TableModel {
  header: string[]
  aligns: TableAlign[]
  rows: string[][]
}

export interface ParsedTable {
  model: TableModel
  /** cells[0] 是表头，cells[1..] 对应表体；区间指向单元格内容（已去掉首尾空白） */
  cells: SpanRange[][]
  columnCount: number
}

interface RawCell {
  value: string
  from: number
  to: number
}

interface SourceLine {
  text: string
  from: number
}

const DELIMITER_RE = /^:?-+:?$/

function scanLine(text: string, from: number): RawCell[] {
  const segments: SpanRange[] = []
  let start = 0
  let index = 0
  let fence = 0

  while (index < text.length) {
    const char = text[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '`') {
      let run = 1
      while (text[index + run] === '`') run += 1
      if (fence === 0) fence = run
      else if (fence === run) fence = 0
      index += run
      continue
    }
    if (char === '|' && fence === 0) {
      segments.push({ from: start, to: index })
      start = index + 1
    }
    index += 1
  }
  segments.push({ from: start, to: text.length })

  // 行首/行尾的竖线只起装饰作用，不能产生空单元格
  if (segments.length > 1 && text.trimStart().startsWith('|')) segments.shift()
  if (segments.length > 1) {
    const last = segments[segments.length - 1]
    if (!text.slice(last.from, last.to).trim() && text.trimEnd().endsWith('|')) segments.pop()
  }

  return segments.map((segment) => {
    const raw = text.slice(segment.from, segment.to)
    const value = raw.trim()
    const from0 = from + segment.from + (raw.length - raw.trimStart().length)
    return {
      value,
      from: from0,
      to: from0 + value.length
    }
  })
}

function splitLines(source: string, base: number): SourceLine[] {
  const lines: SourceLine[] = []
  let offset = 0
  for (const raw of source.split('\n')) {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    lines.push({ text, from: base + offset })
    offset += raw.length + 1
  }
  return lines
}

function parseAlign(value: string): TableAlign | null {
  if (!DELIMITER_RE.test(value)) return null
  const left = value.startsWith(':')
  const right = value.endsWith(':')
  if (left && right) return 'center'
  if (left) return 'left'
  if (right) return 'right'
  return 'none'
}

function padRow(cells: string[], width: number): string[] {
  const row = cells.slice(0, width)
  while (row.length < width) row.push('')
  return row
}

export function parseTable(source: string, base: number): ParsedTable | null {
  const lines = splitLines(source, base)
  if (lines.length < 2) return null

  const header = scanLine(lines[0].text, lines[0].from)
  const delimiter = scanLine(lines[1].text, lines[1].from)
  if (header.length === 0 || header.length !== delimiter.length) return null

  const aligns: TableAlign[] = []
  for (const cell of delimiter) {
    const align = parseAlign(cell.value)
    if (!align) return null
    aligns.push(align)
  }

  const width = header.length
  const bodyCells: RawCell[][] = []
  const rows: string[][] = []
  for (const line of lines.slice(2)) {
    if (!line.text.trim()) break
    const cells = scanLine(line.text, line.from)
    bodyCells.push(cells)
    rows.push(padRow(cells.map((cell) => cell.value), width))
  }

  const bodyRanges: SpanRange[][] = []
  for (let i = 0; i < bodyCells.length; i += 1) {
    const line = lines[2 + i]
    const ranges = bodyCells[i].slice(0, width).map((cell) => ({ from: cell.from, to: cell.to }))
    const end = line.from + line.text.length
    while (ranges.length < width) ranges.push({ from: end, to: end })
    bodyRanges.push(ranges)
  }

  return {
    model: {
      header: header.map((cell) => cell.value),
      aligns,
      rows
    },
    cells: [
      header.map((cell) => ({ from: cell.from, to: cell.to })),
      ...bodyRanges
    ],
    columnCount: width
  }
}

function escapeCell(value: string): string {
  let out = ''
  let backslashes = 0
  for (const char of value.trim()) {
    if (char === '|' && backslashes % 2 === 0) out += '\\|'
    else out += char
    backslashes = char === '\\' ? backslashes + 1 : 0
  }
  return out
}

function formatRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`
}

function delimiterFor(align: TableAlign): string {
  switch (align) {
    case 'left':
      return ':---'
    case 'center':
      return ':---:'
    case 'right':
      return '---:'
    case 'none':
      return '---'
  }
}

export function serializeTable(model: TableModel): string {
  const width = model.aligns.length
  if (width === 0) return ''
  const header = padRow(model.header, width)
  const lines = [
    formatRow(header.map(escapeCell)),
    formatRow(model.aligns.map(delimiterFor))
  ]
  for (const row of model.rows) {
    lines.push(formatRow(padRow(row, width).map(escapeCell)))
  }
  return lines.join('\n')
}

function clamp(index: number, min: number, max: number): number {
  return Math.min(Math.max(index, min), max)
}

export function insertRow(model: TableModel, index: number): TableModel {
  const at = clamp(index, 0, model.rows.length)
  const rows = model.rows.slice()
  rows.splice(at, 0, model.aligns.map(() => ''))
  return { ...model, rows }
}

export function deleteRow(model: TableModel, index: number): TableModel {
  if (index < 0 || index >= model.rows.length) return model
  const rows = model.rows.slice()
  rows.splice(index, 1)
  return { ...model, rows }
}

export function insertColumn(model: TableModel, index: number): TableModel {
  const at = clamp(index, 0, model.aligns.length)
  const header = model.header.slice()
  header.splice(at, 0, '')
  const aligns = model.aligns.slice()
  aligns.splice(at, 0, 'none')
  return {
    header,
    aligns,
    rows: model.rows.map((row) => {
      const next = row.slice()
      next.splice(at, 0, '')
      return next
    })
  }
}

export function deleteColumn(model: TableModel, index: number): TableModel {
  if (model.aligns.length <= 1) return model
  if (index < 0 || index >= model.aligns.length) return model
  const header = model.header.slice()
  header.splice(index, 1)
  const aligns = model.aligns.slice()
  aligns.splice(index, 1)
  return {
    header,
    aligns,
    rows: model.rows.map((row) => {
      const next = row.slice()
      next.splice(index, 1)
      return next
    })
  }
}

export function setAlign(model: TableModel, index: number, align: TableAlign): TableModel {
  if (index < 0 || index >= model.aligns.length) return model
  const aligns = model.aligns.slice()
  aligns[index] = align
  return { ...model, aligns }
}

const ALIGN_CYCLE: readonly TableAlign[] = ['none', 'left', 'center', 'right']

export function cycleAlign(align: TableAlign): TableAlign {
  return ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(align) + 1) % ALIGN_CYCLE.length]
}
