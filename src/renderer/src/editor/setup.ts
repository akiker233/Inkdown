import { autocompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, search } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  keymap,
  rectangularSelection
} from '@codemirror/view'
import { mdHighlightStyle } from './theme'
import { editingExtensions } from './editing'
import { searchHighlight } from './searchHighlight'
import { imageDropPaste } from './livePreview/dropPaste'

/** 撤销/重做交给原生菜单命令执行，避免 accelerator 与 CM 键位各触发一次 */
const HISTORY_KEYS = new Set(['Mod-z', 'Mod-y', 'Mod-Shift-z'])
/** 这些默认键位会和菜单加速键抢事件：Ctrl+/ 源码、Ctrl+I 斜体、Ctrl+Shift+K 代码块 */
const RESERVED_KEYS = new Set(['Mod-/', 'Mod-i', 'Shift-Mod-k'])

/**
 * 手工装配扩展（不用 basicSetup）—— 后续 livePreview 装饰层要插进这条链里，
 * basicSetup 打包太粗、无法精细控制。
 */
export function createExtensions(): Extension[] {
  const baseKeymap = defaultKeymap.filter(
    (binding) => !binding.key || !RESERVED_KEYS.has(binding.key)
  )
  const historyKeys = historyKeymap.filter(
    (binding) => !!binding.key && !HISTORY_KEYS.has(binding.key)
  )

  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches(),
    // 只启用查找状态与高亮，不挂自带面板（由 React 面板驱动）
    search({ top: true }),
    searchHighlight(),
    foldGutter(),
    editingExtensions(),
    keymap.of([...baseKeymap, ...historyKeys, indentWithTab]),
    // 代码块语言高亮靠 languages 惰性加载，避免打包全部语言包
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(mdHighlightStyle),
    imageDropPaste(),
    EditorView.lineWrapping,
    EditorState.tabSize.of(2)
  ]
}
