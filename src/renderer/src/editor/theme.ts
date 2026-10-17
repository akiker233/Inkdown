import type { Extension } from '@codemirror/state'
import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/**
 * 语法高亮刻意只输出语义类名（.md-h1 / .md-strong …），
 * 与 markdown.css 的 `:is(h1, .md-h1)` 双选择器对接：
 * 这样源码模式的语法高亮与即时渲染的排版共用同一套规则，不会两边漂移。
 * 具体颜色一律来自 tokens.css 的 CSS 变量，因此这份 HighlightStyle 与主题无关。
 */
export const mdHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, class: 'md-h1' },
  { tag: t.heading2, class: 'md-h2' },
  { tag: t.heading3, class: 'md-h3' },
  { tag: t.heading4, class: 'md-h4' },
  { tag: t.heading5, class: 'md-h5' },
  { tag: t.heading6, class: 'md-h6' },
  { tag: t.strong, class: 'md-strong' },
  { tag: t.emphasis, class: 'md-em' },
  { tag: t.strikethrough, class: 'md-del' },
  { tag: t.monospace, class: 'md-code' },
  { tag: t.link, class: 'md-link' },
  { tag: t.url, class: 'md-url' },
  { tag: t.quote, class: 'md-blockquote' },
  { tag: t.list, class: 'md-li' },
  { tag: t.contentSeparator, class: 'md-hr' },
  // 语法标记本身（#、**、`、> 等），用弱化色
  { tag: t.processingInstruction, class: 'md-char' },

  // 代码块内的 token 高亮
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], class: 'tok-keyword' },
  { tag: [t.string, t.special(t.string), t.regexp], class: 'tok-string' },
  { tag: [t.comment, t.lineComment, t.blockComment], class: 'tok-comment' },
  { tag: [t.number, t.integer, t.float], class: 'tok-number' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'tok-function' },
  { tag: [t.typeName, t.className, t.namespace], class: 'tok-type' },
  { tag: [t.operator, t.punctuation], class: 'tok-operator' },
  { tag: [t.variableName, t.definition(t.variableName)], class: 'tok-variable' },
  { tag: [t.propertyName, t.attributeName], class: 'tok-property' },
  { tag: [t.tagName, t.angleBracket], class: 'tok-tag' },
  { tag: [t.bool, t.null, t.atom], class: 'tok-bool' }
])

/** CodeMirror 自身的 chrome 样式，值全部走 CSS 变量，深浅色由 tokens.css 决定 */
export function createEditorTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'transparent',
        color: 'var(--text-color)',
        height: '100%'
      },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': { fontFamily: 'var(--md-font-family)' },
      '.cm-content': { caretColor: 'var(--md-caret-color)' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--md-caret-color)',
        borderLeftWidth: '2px'
      },
      '.cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'var(--select-text-bg-color)'
      },
      '.cm-panels': {
        backgroundColor: 'var(--ui-titlebar-bg)',
        color: 'var(--text-color)'
      }
    },
    { dark }
  )
}
