import { Annotation, Compartment, EditorState, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import type { AppLanguage } from '@shared/ipc/contract'
import { notifyCursor } from '../editor/activeView'
import { livePreview } from '../editor/livePreview'
import { docPathField } from '../editor/livePreview/docPath'
import { createExtensions } from '../editor/setup'
import { createEditorTheme } from '../editor/theme'
import { focusModeExtension, typewriterExtension } from '../editor/viewModes'
import { resolveDark, useEditorStore } from './store/editorStore'

/**
 * 主题/模式切换一律走 Compartment，绝不重建 EditorView
 * （会丢撤销历史、滚动位置与 IME 状态）。
 */
export const themeCompartment = new Compartment()
export const modeCompartment = new Compartment()
export const focusCompartment = new Compartment()
export const typewriterCompartment = new Compartment()
export const spellcheckCompartment = new Compartment()

export function sourceModeExtension(sourceMode: boolean): Extension {
  return sourceMode ? [] : livePreview()
}

/** .cm-content 既是排版容器，也承载原生拼写检查的语言与开关 */
export function editorAttributes(spellcheck: boolean, language: AppLanguage): Extension {
  return EditorView.contentAttributes.of({
    class: 'markdown-body',
    spellcheck: spellcheck ? 'true' : 'false',
    lang: language === 'zh' ? 'zh-CN' : 'en'
  })
}

function currentEditorAttributes(): Extension {
  const { spellcheck, language } = useEditorStore.getState()
  return editorAttributes(spellcheck, language)
}

/** 标记"这是程序替换全文"，让 updateListener 不要把外部重载当成用户编辑 */
export const reloadAnnotation = Annotation.define<boolean>()

/** 滚动快照是单个 StateEffect，切回标签时 dispatch 即可恢复位置 */
export type ScrollSnapshot = ReturnType<EditorView['scrollSnapshot']>

export interface TabEditorState {
  state: EditorState
  scroll: ScrollSnapshot | null
}

/**
 * 每个标签一份独立的 EditorState：切换标签时用 view.setState 换状态，
 * 撤销历史与选区都跟着标签走，而不是共用一个历史栈。
 */
const registry = new Map<string, TabEditorState>()

function currentTheme(): ReturnType<typeof createEditorTheme> {
  const { theme, systemDark } = useEditorStore.getState()
  return createEditorTheme(resolveDark(theme, systemDark))
}

function contentListener(): ReturnType<typeof EditorView.updateListener.of> {
  return EditorView.updateListener.of((update) => {
    if (update.selectionSet || update.docChanged) {
      notifyCursor(update.state.selection.main.head)
    }
    if (!update.docChanged) return
    // 外部重载产生的整篇替换不算用户编辑
    if (update.transactions.some((tr) => tr.annotation(reloadAnnotation))) return
    const { activeId, setEditorContent } = useEditorStore.getState()
    if (activeId) setEditorContent(activeId, update.state.doc.toString())
  })
}

/** 编辑器聚焦时也要能切源码模式；原生菜单的 accelerator 覆盖不到 CDP/注入按键 */
function sourceModeKeymap(): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: 'Mod-/',
        preventDefault: true,
        run: () => {
          useEditorStore.getState().toggleSourceMode()
          return true
        }
      }
    ])
  )
}

export function createStateForTab(tabId: string, content: string, docPath = ''): EditorState {
  const state = EditorState.create({
    doc: content,
    extensions: [
      ...createExtensions(),
      docPathField.init(() => docPath),
      sourceModeKeymap(),
      modeCompartment.of(sourceModeExtension(useEditorStore.getState().sourceMode)),
      focusCompartment.of(focusModeExtension(useEditorStore.getState().focusMode)),
      typewriterCompartment.of(typewriterExtension(useEditorStore.getState().typewriter)),
      spellcheckCompartment.of(currentEditorAttributes()),
      themeCompartment.of(currentTheme()),
      contentListener()
    ]
  })
  registry.set(tabId, { state, scroll: null })
  return state
}

export function ensureTabState(tabId: string, content: string, docPath = ''): TabEditorState {
  const existing = registry.get(tabId)
  if (existing) return existing
  return { state: createStateForTab(tabId, content, docPath), scroll: null }
}

export function getTabState(tabId: string): TabEditorState | undefined {
  return registry.get(tabId)
}

/**
 * 后台标签的外部重载：直接更新 registry 里的状态。
 * reloadAnnotation 让 contentListener 忽略这次整篇替换，不会误标脏。
 */
export function replaceTabContent(tabId: string, content: string): void {
  const entry = registry.get(tabId)
  if (!entry || entry.state.doc.toString() === content) return
  const state = entry.state.update({
    changes: { from: 0, to: entry.state.doc.length, insert: content },
    annotations: reloadAnnotation.of(true)
  }).state
  registry.set(tabId, { state, scroll: entry.scroll })
}

export function setTabState(tabId: string, state: EditorState): void {
  registry.set(tabId, { state, scroll: registry.get(tabId)?.scroll ?? null })
}

export function setTabScroll(tabId: string, scroll: ScrollSnapshot): void {
  const entry = registry.get(tabId)
  if (entry) entry.scroll = scroll
}

export function dropTabState(tabId: string): void {
  registry.delete(tabId)
}

/** 只保留仍然存在的标签的状态；关闭标签后调用，避免撤销历史越攒越多 */
export function pruneTabStates(keepIds: readonly string[]): void {
  const keep = new Set(keepIds)
  for (const id of [...registry.keys()]) {
    if (!keep.has(id)) registry.delete(id)
  }
}

/** 主题变化时把所有后台标签的状态也一起重配，否则切回去会看到旧主题 */
export function reconfigureAllThemes(): void {
  const theme = currentTheme()
  for (const [id, entry] of registry) {
    const tr = entry.state.update({ effects: themeCompartment.reconfigure(theme) })
    registry.set(id, { state: tr.state, scroll: entry.scroll })
  }
}

/** 源码/即时渲染切换同样只重配 Compartment，后台标签也要同步 */
export function reconfigureAllModes(sourceMode: boolean): void {
  const extension = sourceModeExtension(sourceMode)
  for (const [id, entry] of registry) {
    const tr = entry.state.update({ effects: modeCompartment.reconfigure(extension) })
    registry.set(id, { state: tr.state, scroll: entry.scroll })
  }
}

export function reconfigureAllFocus(focusMode: boolean): void {
  const extension = focusModeExtension(focusMode)
  for (const [id, entry] of registry) {
    const tr = entry.state.update({ effects: focusCompartment.reconfigure(extension) })
    registry.set(id, { state: tr.state, scroll: entry.scroll })
  }
}

export function reconfigureAllTypewriter(typewriter: boolean): void {
  const extension = typewriterExtension(typewriter)
  for (const [id, entry] of registry) {
    const tr = entry.state.update({ effects: typewriterCompartment.reconfigure(extension) })
    registry.set(id, { state: tr.state, scroll: entry.scroll })
  }
}

export function reconfigureAllEditorAttributes(): void {
  const extension = currentEditorAttributes()
  for (const [id, entry] of registry) {
    const tr = entry.state.update({ effects: spellcheckCompartment.reconfigure(extension) })
    registry.set(id, { state: tr.state, scroll: entry.scroll })
  }
}
