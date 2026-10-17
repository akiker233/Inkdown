import { getSearchQuery, setSearchQuery } from '@codemirror/search'
import { RangeSetBuilder, type Extension } from '@codemirror/state'
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate
} from '@codemirror/view'

/**
 * CM 自带高亮只在它自己的搜索面板打开时生效；这里复用同一个查询状态，
 * 给 React 搜索面板提供同款 .cm-searchMatch 标记。
 */
const matchMark = Decoration.mark({ class: 'cm-searchMatch' })
const selectedMark = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' })

function buildDecorations(view: EditorView): DecorationSet {
  const query = getSearchQuery(view.state)
  if (!query.valid || !query.search) return Decoration.none

  const builder = new RangeSetBuilder<Decoration>()
  let coveredTo = -1
  for (const visible of view.visibleRanges) {
    const cursor = query.getCursor(view.state, visible.from, visible.to)
    for (let next = cursor.next(); !next.done; next = cursor.next()) {
      const { from, to } = next.value
      if (from < coveredTo) continue
      coveredTo = to
      const selected = view.state.selection.ranges.some((r) => r.from === from && r.to === to)
      builder.add(from, to, selected ? selectedMark : matchMark)
    }
  }
  return builder.finish()
}

function queryChanged(update: ViewUpdate): boolean {
  return update.transactions.some((tr) => tr.effects.some((effect) => effect.is(setSearchQuery)))
}

export function searchHighlight(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view)
      }

      update(update: ViewUpdate): void {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          queryChanged(update)
        ) {
          this.decorations = buildDecorations(update.view)
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}
