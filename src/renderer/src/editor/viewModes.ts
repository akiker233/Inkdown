import type { Extension } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'

/**
 * 专注模式：只给光标所在行打标记，其余行由 CSS 淡化。
 * 用装饰而不是改 DOM 类，切换标签 / 撤销时都能跟着 EditorState 走。
 */
export function focusModeExtension(enabled: boolean): Extension {
  if (!enabled) return []
  return EditorView.decorations.compute(['selection', 'doc'], (state) => {
    const line = state.doc.lineAt(state.selection.main.head)
    return Decoration.set([Decoration.line({ class: 'md-focus-line' }).range(line.from)])
  })
}

let centerScheduled = false

function centerLine(view: EditorView): void {
  // requestMeasure 保证在布局完成后读取坐标，刚打开文档时不会用旧行高算偏
  view.requestMeasure({
    key: 'inkdown-typewriter',
    read: (v) => {
      const line = v.state.doc.lineAt(v.state.selection.main.head)
      const from = v.coordsAtPos(line.from)
      const to = v.coordsAtPos(line.to)
      if (!from || !to) return null
      const rect = v.scrollDOM.getBoundingClientRect()
      // 用整行盒子的中心对齐，避免标题行因为半行高偏下
      return (from.top + to.bottom) / 2 - (rect.top + rect.height / 2)
    },
    write: (delta, v) => {
      if (delta === null || Math.abs(delta) < 4) return
      const max = v.scrollDOM.scrollHeight - v.scrollDOM.clientHeight
      v.scrollDOM.scrollTop = Math.min(max, Math.max(0, v.scrollDOM.scrollTop + delta))
    }
  })
}

function scheduleCenter(view: EditorView): void {
  if (centerScheduled) return
  centerScheduled = true
  requestAnimationFrame(() => {
    centerScheduled = false
    if (view.dom.isConnected) centerLine(view)
  })
}

/** 打字机模式：光标移动后把当前行滚到视口垂直中央 */
export function typewriterExtension(enabled: boolean): Extension {
  if (!enabled) return []
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged && !update.selectionSet) return
    if (update.view.composing) return
    scheduleCenter(update.view)
  })
}

/** 刚开启打字机模式时先对齐一次 */
export function centerCurrentLine(view: EditorView): void {
  scheduleCenter(view)
}
