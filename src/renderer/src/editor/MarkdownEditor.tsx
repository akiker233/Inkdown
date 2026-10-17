import { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import {
  editorAttributes,
  ensureTabState,
  focusCompartment,
  getTabState,
  modeCompartment,
  setTabScroll,
  setTabState,
  sourceModeExtension,
  spellcheckCompartment,
  themeCompartment,
  typewriterCompartment
} from '../app/editorStates'
import { activeTabOf, resolveDark, useEditorStore } from '../app/store/editorStore'
import { setActiveView } from './activeView'
import { refreshDecorationsEffect } from './livePreview'
import { createEditorTheme } from './theme'
import { docPathField, setDocPath } from './livePreview/docPath'
import { centerCurrentLine, focusModeExtension, typewriterExtension } from './viewModes'

/**
 * 只有一个 EditorView，每个标签一份 EditorState。
 * 切换标签走 view.setState —— 撤销历史、选区跟着标签走，视图本身不重建。
 */
export function MarkdownEditor() {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const activeIdRef = useRef<string | null>(null)

  const activeId = useEditorStore((s) => s.activeId)
  const activePath = useEditorStore((s) => activeTabOf(s)?.path ?? '')
  const reloadToken = useEditorStore((s) => activeTabOf(s)?.reloadToken ?? 0)
  const theme = useEditorStore((s) => s.theme)
  const systemDark = useEditorStore((s) => s.systemDark)
  const sourceMode = useEditorStore((s) => s.sourceMode)
  const focusMode = useEditorStore((s) => s.focusMode)
  const typewriter = useEditorStore((s) => s.typewriter)
  const spellcheck = useEditorStore((s) => s.spellcheck)
  const language = useEditorStore((s) => s.language)
  const dark = resolveDark(theme, systemDark)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const tab = activeTabOf(useEditorStore.getState())
    if (!tab) return

    const entry = ensureTabState(tab.id, tab.content, tab.path ?? '')
    const view = new EditorView({ parent: host, state: entry.state })
    viewRef.current = view
    activeIdRef.current = tab.id
    setActiveView(view)
    if (import.meta.env.DEV) {
      ;(window as unknown as { __inkdownView?: EditorView }).__inkdownView = view
    }

    if (entry.scroll) view.dispatch({ effects: entry.scroll })
    view.focus()

    return () => {
      setActiveView(null)
      view.destroy()
      viewRef.current = null
      activeIdRef.current = null
      if (import.meta.env.DEV) {
        delete (window as unknown as { __inkdownView?: EditorView }).__inkdownView
      }
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !activeId) return

    const previous = activeIdRef.current
    if (previous === activeId) return

    if (previous) {
      setTabState(previous, view.state)
      setTabScroll(previous, view.scrollSnapshot())
    }
    activeIdRef.current = activeId

    const tab = useEditorStore.getState().tabs.find((t) => t.id === activeId)
    if (!tab) return

    const entry = ensureTabState(activeId, tab.content, tab.path ?? '')
    view.setState(entry.state)
    if (entry.scroll) view.dispatch({ effects: entry.scroll })
    setActiveView(view)
    view.focus()
  }, [activeId])

  // 标签换路径（另存为 / 重命名）后，图片相对路径要跟着换基准
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.field(docPathField, false) === activePath) return

    view.dispatch({ effects: setDocPath.of(activePath) })
    const id = useEditorStore.getState().activeId
    if (id) setTabState(id, view.state)
  }, [activePath, activeId])

  // 外部重载：registry 已持有新状态，这里把它换进视图并尽量保持滚动位置
  useEffect(() => {
    const view = viewRef.current
    if (!view || !activeId) return

    const entry = getTabState(activeId)
    if (!entry || entry.state === view.state) return

    const snapshot = view.scrollSnapshot()
    view.setState(entry.state)
    view.dispatch({ effects: snapshot })
    view.focus()
  }, [reloadToken, activeId])

  // 主题只重配 Compartment，不重建 EditorView
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    // 子组件 effect 先于 App 执行：先把主题落到 DOM，Mermaid 重建时才能读到新值
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    view.dispatch({
      effects: [
        themeCompartment.reconfigure(createEditorTheme(dark)),
        // Mermaid 等 widget 的配色画在 SVG 里，必须让装饰层重建一次
        refreshDecorationsEffect.of(null)
      ]
    })
    const id = useEditorStore.getState().activeId
    if (id) setTabState(id, view.state)
  }, [dark])

  // Ctrl+/ 源码往返同样是 Compartment 重配，Undo 历史与滚动位置保持不变
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: modeCompartment.reconfigure(sourceModeExtension(sourceMode))
    })
    const id = useEditorStore.getState().activeId
    if (id) setTabState(id, view.state)
  }, [sourceMode])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: focusCompartment.reconfigure(focusModeExtension(focusMode))
    })
    const id = useEditorStore.getState().activeId
    if (id) setTabState(id, view.state)
  }, [focusMode])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: typewriterCompartment.reconfigure(typewriterExtension(typewriter))
    })
    if (typewriter) centerCurrentLine(view)
    const id = useEditorStore.getState().activeId
    if (id) setTabState(id, view.state)
  }, [typewriter])

  // 语言/拼写检查影响 .cm-content 属性与 widget 文案，需要重配并重建装饰
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: [
        spellcheckCompartment.reconfigure(editorAttributes(spellcheck, language)),
        refreshDecorationsEffect.of(null)
      ]
    })
    const id = useEditorStore.getState().activeId
    if (id) setTabState(id, view.state)
  }, [spellcheck, language])

  return <div ref={hostRef} className={focusMode ? 'editor-host is-focus-mode' : 'editor-host'} />
}
