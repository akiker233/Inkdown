import { redo, selectAll, undo } from '@codemirror/commands'
import { EditorSelection, type EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { t } from '../i18n'
import { getActiveView } from './activeView'
import { insertImagePaths } from './livePreview/dropPaste'

const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+|$)/
const QUOTE_RE = /^(\s*)>\s?/
const TASK_RE = /^(\s*)[-*+]\s+\[[ xX]\]\s+/
const BULLET_RE = /^(\s*)[-*+]\s+/
const ORDERED_RE = /^(\s*)\d+[.)]\s+/

function activeView(): EditorView | null {
  return getActiveView()
}

/** 只变换选中的整行；选区结束在下一行行首时不把该行算进来 */
function mutateLines(view: EditorView, transform: (lines: string[]) => string[] | null): boolean {
  const state = view.state
  const range = state.selection.main
  const first = state.doc.lineAt(range.from).number
  let last = state.doc.lineAt(range.to).number
  if (last > first && range.to === state.doc.line(last).from) last -= 1

  const lines: string[] = []
  for (let n = first; n <= last; n += 1) lines.push(state.doc.line(n).text)

  const next = transform(lines)
  if (!next) return false
  if (next.every((line, index) => line === lines[index])) return false

  view.dispatch({
    changes: next.map((text, index) => {
      const line = state.doc.line(first + index)
      return { from: line.from, to: line.to, insert: text }
    })
  })
  view.focus()
  return true
}

const INDENT_RE = /^\s*/

function stripHeading(line: string): string {
  return line.replace(HEADING_RE, '')
}

function addHeading(line: string, level: number): string {
  const marker = `${'#'.repeat(level)} `
  return marker + stripHeading(line).trimStart()
}

export function setHeading(level: number): boolean {
  const view = activeView()
  if (!view) return false

  return mutateLines(view, (lines) => {
    if (level === 0) {
      if (!lines.some((line) => HEADING_RE.test(line))) return null
      return lines.map(stripHeading)
    }

    const already = lines.every((line) => {
      const match = HEADING_RE.exec(line)
      return match ? match[1].length === level : false
    })
    if (already) return lines.map(stripHeading)
    return lines.map((line) => addHeading(line, level))
  })
}

export function toggleQuote(): boolean {
  const view = activeView()
  if (!view) return false

  return mutateLines(view, (lines) => {
    const filled = lines.filter((line) => line.trim() !== '')
    const allQuoted = filled.length > 0 && filled.every((line) => /^\s*>/.test(line))
    return lines.map((line) => {
      if (line.trim() === '') return allQuoted ? line.replace(QUOTE_RE, '$1') : line
      if (allQuoted) return line.replace(QUOTE_RE, '$1')
      const indent = INDENT_RE.exec(line)?.[0] ?? ''
      return `${indent}> ${line.slice(indent.length)}`
    })
  })
}

type ListKind = 'ordered' | 'bullet' | 'task'

function listMatcher(kind: ListKind): RegExp {
  if (kind === 'ordered') return ORDERED_RE
  if (kind === 'task') return TASK_RE
  return BULLET_RE
}

function stripListMarker(line: string): string {
  return line.replace(TASK_RE, '$1').replace(ORDERED_RE, '$1').replace(BULLET_RE, '$1')
}

export function toggleList(kind: ListKind): boolean {
  const view = activeView()
  if (!view) return false

  return mutateLines(view, (lines) => {
    const matcher = listMatcher(kind)
    const filled = lines.filter((line) => line.trim() !== '')
    const allMatch = filled.length > 0 && filled.every((line) => matcher.test(line))
    if (allMatch) return lines.map(stripListMarker)

    let index = 0
    return lines.map((line) => {
      if (line.trim() === '') return ''
      index += 1
      const content = stripListMarker(line)
      const indent = INDENT_RE.exec(content)?.[0] ?? ''
      const body = content.slice(indent.length)
      if (kind === 'ordered') return `${indent}${index}. ${body}`
      if (kind === 'task') return `${indent}- [ ] ${body}`
      return `${indent}- ${body}`
    })
  })
}

/** 在选区处插入块级片段；当前行有内容时另起一个空行放置 */
function insertSnippet(
  view: EditorView,
  snippet: string,
  cursorOffset: number,
  selectLength = 0
): boolean {
  const state = view.state
  const range = state.selection.main

  if (range.from !== range.to) {
    const anchor = range.from + cursorOffset
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: snippet },
      selection: EditorSelection.single(anchor, anchor + selectLength)
    })
    view.focus()
    return true
  }

  const line = state.doc.lineAt(range.from)
  if (line.text.trim() === '') {
    const anchor = line.from + cursorOffset
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: snippet },
      selection: EditorSelection.single(anchor, anchor + selectLength)
    })
    view.focus()
    return true
  }

  // 光标在正文行内时插到该行之后，绝不吞掉原有内容
  const insert = `\n\n${snippet}`
  const anchor = line.to + 2 + cursorOffset
  view.dispatch({
    changes: { from: line.to, insert },
    selection: EditorSelection.single(anchor, anchor + selectLength)
  })
  view.focus()
  return true
}

/** 代码/公式块：有选区时把选区包进块里，正文行则整行转成块，避免内容丢失 */
function insertWrappedBlock(
  view: EditorView,
  fence: string,
  fallbackInner: string,
  innerCursorOffset: number
): boolean {
  const state = view.state
  const range = state.selection.main
  if (range.from !== range.to) {
    const inner = state.sliceDoc(range.from, range.to)
    const insert = `${fence}\n${inner}\n${fence}`
    const anchor = range.from + fence.length + 1
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.cursor(anchor)
    })
    view.focus()
    return true
  }

  const line = state.doc.lineAt(range.from)
  const inner = line.text.trim() === '' ? fallbackInner : line.text
  const insert = `${fence}\n${inner}\n${fence}`
  const anchor = line.from + fence.length + 1 + innerCursorOffset
  view.dispatch({
    changes: { from: line.from, to: line.to, insert },
    selection: EditorSelection.cursor(anchor)
  })
  view.focus()
  return true
}

export function insertCodeFence(): boolean {
  const view = activeView()
  if (!view) return false
  return insertWrappedBlock(view, '```', '', 0)
}

export function insertMathBlock(): boolean {
  const view = activeView()
  if (!view) return false
  return insertWrappedBlock(view, '$$', '', 0)
}

export function insertHr(): boolean {
  const view = activeView()
  if (!view) return false
  return insertSnippet(view, '---', 3)
}

export function insertTable(): boolean {
  const view = activeView()
  if (!view) return false
  const first = t('cmd.tableCol', { n: 1 })
  const second = t('cmd.tableCol', { n: 2 })
  const snippet = `| ${first} | ${second} |\n| --- | --- |\n|  |  |`
  return insertSnippet(view, snippet, 2, first.length)
}

function charRun(text: string, start: number, step: 1 | -1, char: string): number {
  let count = 0
  for (let pos = start; pos >= 0 && pos < text.length && text[pos] === char; pos += step) {
    count += 1
  }
  return count
}

function docCharRun(state: EditorState, pos: number, step: 1 | -1, char: string): number {
  let count = 0
  for (
    let cursor = pos;
    cursor >= 0 && cursor < state.doc.length && state.sliceDoc(cursor, cursor + 1) === char;
    cursor += step
  ) {
    count += 1
  }
  return count
}

/** 粗体与斜体共用 `*`：星号数能反推当前是否已应用该样式 */
function markerApplied(run: number, length: number, char: string): boolean {
  if (char !== '*') return run === length
  return length === 1 ? run % 2 === 1 : run >= 2
}

function toggleWrap(before: string, after = before): boolean {
  const view = activeView()
  if (!view) return false
  const state = view.state
  const range = state.selection.main

  if (range.from === range.to) {
    const pos = range.from
    view.dispatch({
      changes: { from: pos, insert: before + after },
      selection: EditorSelection.single(pos + before.length)
    })
    view.focus()
    return true
  }

  const text = state.doc.sliceString(range.from, range.to)
  const markerChar = before[0]
  const startRun = charRun(text, 0, 1, markerChar)
  const endRun = charRun(text, text.length - 1, -1, markerChar)
  const wrapsWholeSelection =
    text.length >= before.length + after.length &&
    markerApplied(startRun, before.length, markerChar) &&
    markerApplied(endRun, after.length, markerChar)

  if (wrapsWholeSelection) {
    const inner = text.slice(before.length, text.length - after.length)
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: inner },
      selection: EditorSelection.single(range.from, range.from + inner.length)
    })
    view.focus()
    return true
  }

  // 选区停在正文上时，检查紧贴两侧的标记，实现"再按一次取消"
  const beforeRun = docCharRun(state, range.from - 1, -1, markerChar)
  const afterRun = docCharRun(state, range.to, 1, markerChar)
  if (
    markerApplied(beforeRun, before.length, markerChar) &&
    markerApplied(afterRun, after.length, markerChar) &&
    range.from >= before.length &&
    range.to + after.length <= state.doc.length
  ) {
    const aroundFrom = range.from - before.length
    const aroundTo = range.to + after.length
    view.dispatch({
      changes: [
        { from: aroundFrom, to: range.from, insert: '' },
        { from: range.to, to: aroundTo, insert: '' }
      ],
      selection: EditorSelection.single(aroundFrom, range.to - before.length)
    })
    view.focus()
    return true
  }

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: before + text + after },
    selection: EditorSelection.single(range.from + before.length, range.to + before.length)
  })
  view.focus()
  return true
}

export function toggleBold(): boolean {
  return toggleWrap('**')
}

export function toggleItalic(): boolean {
  return toggleWrap('*')
}

export function toggleStrike(): boolean {
  return toggleWrap('~~')
}

export function toggleHighlight(): boolean {
  return toggleWrap('==')
}

export function toggleInlineCode(): boolean {
  return toggleWrap('`')
}

export function insertLink(): boolean {
  const view = activeView()
  if (!view) return false
  const state = view.state
  const range = state.selection.main

  if (range.from === range.to) {
    const text = t('cmd.linkText')
    const snippet = `[${text}](url)`
    view.dispatch({
      changes: { from: range.from, insert: snippet },
      selection: EditorSelection.single(range.from + 1, range.from + 1 + text.length)
    })
  } else {
    const text = state.doc.sliceString(range.from, range.to)
    const snippet = `[${text}](url)`
    const urlStart = range.from + text.length + 3
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: snippet },
      selection: EditorSelection.single(urlStart, urlStart + 3)
    })
  }
  view.focus()
  return true
}

export async function insertImage(): Promise<boolean> {
  const view = activeView()
  if (!view) return false
  const at = view.state.selection.main.from
  const { paths } = await window.api.dialog.openFile({ multiple: true, kind: 'image' })
  if (paths.length === 0) return false
  await insertImagePaths(paths, view, at)
  return true
}

export function undoCommand(): boolean {
  const view = activeView()
  return view ? undo(view) : false
}

export function redoCommand(): boolean {
  const view = activeView()
  return view ? redo(view) : false
}

export function selectAllCommand(): boolean {
  const view = activeView()
  if (!view) return false
  const done = selectAll(view)
  view.focus()
  return done
}
