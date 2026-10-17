import { EditorView } from '@codemirror/view'

/**
 * 大纲等外围面板通过这里操作"当前唯一那个 EditorView"。
 * MarkdownEditor 负责注册 / 注销，面板不直接碰 CodeMirror 实例。
 */
let current: EditorView | null = null

type CursorListener = (offset: number) => void
const cursorListeners = new Set<CursorListener>()

export function setActiveView(view: EditorView | null): void {
  current = view
  if (view) notifyCursor(view.state.selection.main.head)
}

export function getActiveView(): EditorView | null {
  return current
}

export function jumpToOffset(offset: number): boolean {
  const view = current
  if (!view) return false
  const pos = Math.min(Math.max(offset, 0), view.state.doc.length)
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'center' })
  })
  view.focus()
  return true
}

export function notifyCursor(offset: number): void {
  for (const listener of cursorListeners) listener(offset)
}

export function subscribeCursor(listener: CursorListener): () => void {
  cursorListeners.add(listener)
  return () => {
    cursorListeners.delete(listener)
  }
}
