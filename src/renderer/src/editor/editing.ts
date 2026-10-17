import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { foldKeymap, foldService, syntaxTree } from '@codemirror/language'
import { EditorSelection, Prec, type EditorState, type Extension, type Text } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { t } from '../i18n'
import { parseOutline } from './outline'

const LIST_RE = /^(\s*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?/
const CODE_NODE_RE = /CodeText|FencedCode|InlineCode|Table/

function inCodeOrTable(view: EditorView, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, -1)
  while (node) {
    if (CODE_NODE_RE.test(node.name)) return true
    node = node.parent
  }
  return false
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
}

/** 把 `[TOC]` 行展开成文档大纲的 Markdown 链接列表 */
function expandToc(view: EditorView, lineFrom: number, lineTo: number): boolean {
  const state = view.state
  const line = state.doc.lineAt(lineFrom)
  const indent = /^\s*/.exec(line.text)?.[0] ?? ''
  const items = parseOutline(state.doc.toString())
  const body = items.length
    ? items
        .map((item) => {
          const text = item.text || t('outline.untitled')
          return `${indent}${'  '.repeat(item.level - 1)}- [${text}](#${slugify(text)})`
        })
        .join('\n')
    : ''

  const insert = body
  view.dispatch({
    changes: { from: line.from, to: lineTo, insert },
    selection: EditorSelection.cursor(line.from + insert.length)
  })
  view.focus()
  return true
}

export interface ListContinuation {
  /** 标记与缩进的总长度，空条目退格时用来整段删除 */
  contentStart: number
  /** 回车后要插入的下一行前缀；空条目为空字符串 */
  insert: string
  empty: boolean
}

/** 根据当前行判断回车后是否续写列表，纯函数便于单测 */
export function listContinuation(lineText: string): ListContinuation | null {
  const match = LIST_RE.exec(lineText)
  if (!match) return null

  const [, indent, marker, , task] = match
  const contentStart = match[0].length
  const rest = lineText.slice(contentStart)
  if (rest.trim() === '') return { contentStart, insert: '', empty: true }

  let nextMarker = marker
  if (/^\d/.test(marker)) {
    const digits = marker.slice(0, -1)
    const punct = marker.slice(-1)
    nextMarker = `${Number(digits) + 1}${punct}`
  }

  return {
    contentStart,
    insert: `\n${indent}${nextMarker} ${task ? '[ ] ' : ''}`,
    empty: false
  }
}

/** Enter：续写列表 / 任务列表；空列表项退出；`[TOC]` 回车生成目录 */
function smartEnter(view: EditorView): boolean {
  const state = view.state
  const range = state.selection.main
  if (range.from !== range.to) return false

  const line = state.doc.lineAt(range.from)
  const cursorInLine = range.from - line.from

  if (
    cursorInLine === line.text.length &&
    line.text.trim().toLowerCase() === '[toc]'
  ) {
    return expandToc(view, line.from, line.to)
  }

  if (inCodeOrTable(view, range.from)) return false

  const continuation = listContinuation(line.text)
  if (!continuation) return false

  // 空条目的回车把标记删掉，等于退出列表
  if (continuation.empty && cursorInLine >= continuation.contentStart) {
    view.dispatch({
      changes: { from: line.from, to: line.from + continuation.contentStart, insert: '' },
      selection: EditorSelection.cursor(line.from)
    })
    view.focus()
    return true
  }

  const insert = continuation.insert
  view.dispatch({
    changes: { from: range.from, insert },
    selection: EditorSelection.cursor(range.from + insert.length),
    scrollIntoView: true
  })
  view.focus()
  return true
}

type FoldService = (
  state: EditorState,
  lineStart: number,
  lineEnd: number
) => { from: number; to: number } | null

/** ATX 标题折叠范围：到下一个同级或更高级标题之前 */
export function headingFoldRange(doc: Text, lineStart: number): { from: number; to: number } | null {
  const line = doc.lineAt(lineStart)
  const match = /^(#{1,6})[ \t]+/.exec(line.text)
  if (!match) return null

  const level = match[1].length
  let lastBodyLine = line.number
  for (let n = line.number + 1; n <= doc.lines; n += 1) {
    const heading = /^(#{1,6})[ \t]+/.exec(doc.line(n).text)
    if (heading && heading[1].length <= level) break
    lastBodyLine = n
  }
  if (lastBodyLine === line.number) return null

  const to = doc.line(lastBodyLine).to
  return to > line.to ? { from: line.to, to } : null
}

const headingFold: FoldService = (state, lineStart) => headingFoldRange(state.doc, lineStart)

/** Ctrl+Shift+[ / ] 已被段落菜单占用，折叠快捷键只保留 Alt 组合，避免双触发 */
const foldKeys = foldKeymap.filter(
  (binding) => binding.key !== 'Ctrl-Shift-[' && binding.key !== 'Ctrl-Shift-]'
)

export function editingExtensions(): Extension {
  return [
    closeBrackets(),
    Prec.high(keymap.of([{ key: 'Enter', run: smartEnter }])),
    keymap.of([...closeBracketsKeymap, ...foldKeys]),
    foldService.of(headingFold)
  ]
}
