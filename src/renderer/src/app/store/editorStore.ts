import { create } from 'zustand'
import type { AppLanguage, AppSettings, ThemeMode } from '@shared/ipc/contract'
import type { Enc, Eol } from '@shared/types/document'
import type { FsChange, RecoverySnapshot, TreeNode } from '@shared/types/workspace'
import { setLanguage as setI18nLanguage, t } from '../../i18n'
import {
  dropTabState,
  pruneTabStates,
  reconfigureAllEditorAttributes,
  reconfigureAllFocus,
  reconfigureAllModes,
  reconfigureAllThemes,
  reconfigureAllTypewriter,
  replaceTabContent
} from '../editorStates'
import { baseName, isSamePath, isUnder, remapPath } from '../paths'

export interface TabConflict {
  mtimeMs: number
  deleted: boolean
}

export interface Tab {
  id: string
  path: string | null
  title: string
  /** 编辑器内容的镜像。EditorView 是实时内容的唯一真源，这里用于状态栏/恢复/自动保存 */
  content: string
  /** 最近一次写入磁盘（或从磁盘读入）的内容，用于精确判断脏状态 */
  savedContent: string
  encoding: Enc
  eol: Eol
  mtimeMs: number
  dirty: boolean
  conflict: TabConflict | null
  /** 外部重载后递增，MarkdownEditor 据此把新内容换进 EditorView */
  reloadToken: number
}

export interface WorkspaceState {
  root: string | null
  tree: TreeNode | null
  watchId: string | null
  loading: boolean
}

export type SidebarView = 'files' | 'outline'

interface OpenWorkspaceOptions {
  /** 启动时恢复上次工作区，不要把错误弹到用户脸上 */
  silentError?: boolean
  /** 是否把工作区写回设置；恢复上次工作区时无需重复写 */
  persist?: boolean
}

interface EditorStore {
  tabs: Tab[]
  activeId: string | null
  theme: ThemeMode
  language: AppLanguage
  spellcheck: boolean
  systemDark: boolean
  fontSize: number
  workspace: WorkspaceState
  sidebarVisible: boolean
  sidebarView: SidebarView
  menuBarVisible: boolean
  formatToolbarVisible: boolean
  focusMode: boolean
  typewriter: boolean
  autoSave: boolean
  autoSaveDelay: number
  recentFiles: string[]
  paletteOpen: boolean
  preferencesOpen: boolean
  aboutOpen: boolean
  searchOpen: boolean
  /** 查找面板是否展开替换行 */
  searchReplace: boolean
  /** 每次打开查找自增，面板据此重新聚焦输入框 */
  searchSeq: number
  recoveryPrompt: RecoverySnapshot | null
  busy: boolean
  /** 源码模式只影响装饰层，Markdown 文本本身从不被改写 */
  sourceMode: boolean

  init: () => Promise<void>
  newDocument: () => void
  openPath: (path: string) => Promise<void>
  openPaths: (paths: string[]) => Promise<void>
  activate: (id: string) => void
  closeTab: (id: string) => Promise<void>
  setEditorContent: (tabId: string, content: string) => void
  saveTab: (id: string, opts?: { silent?: boolean }) => Promise<boolean>
  saveAs: (id: string) => Promise<boolean>
  touchRecent: (path: string) => void

  setTheme: (theme: ThemeMode) => Promise<void>
  setLanguage: (language: AppLanguage) => Promise<void>
  setSpellcheck: (enabled: boolean) => Promise<void>
  setSystemDark: (dark: boolean) => void
  toggleSidebar: () => void
  setSidebarView: (view: SidebarView) => void
  toggleOutline: () => void
  toggleMenuBar: () => void
  setMenuBarVisible: (enabled: boolean) => void
  toggleFormatToolbar: () => void
  setFormatToolbarVisible: (enabled: boolean) => void
  toggleSourceMode: () => void
  toggleFocusMode: () => void
  toggleTypewriter: () => void
  setAutoSave: (enabled: boolean) => void

  openWorkspaceDialog: () => Promise<void>
  openWorkspace: (root: string, opts?: OpenWorkspaceOptions) => Promise<void>
  closeWorkspace: () => void
  refreshTree: () => Promise<void>
  applyFsChanges: (watchId: string, changes: FsChange[]) => void
  createNode: (dir: string, name: string, kind: 'file' | 'dir') => Promise<string | null>
  renameNode: (from: string, to: string) => Promise<boolean>
  deleteNode: (path: string) => Promise<boolean>
  revealNode: (path: string) => Promise<void>

  handleConflict: (path: string, info: { mtimeMs: number; deleted: boolean }) => void
  resolveConflict: (id: string, action: 'reload' | 'keep' | 'save') => Promise<void>
  reloadTab: (id: string) => Promise<void>

  setPaletteOpen: (open: boolean) => void
  setPreferencesOpen: (open: boolean) => void
  setAboutOpen: (open: boolean) => void
  openSearch: (replace?: boolean) => void
  closeSearch: () => void
  resolveRecovery: (accept: boolean) => Promise<void>
}

const RECENT_LIMIT = 24

function nextUntitledTitle(tabs: readonly Tab[]): string {
  const used = new Set(tabs.filter((t) => !t.path).map((t) => t.title))
  const first = t('app.untitled')
  if (!used.has(first)) return first
  let n = 2
  while (used.has(t('app.untitledN', { n }))) n += 1
  return t('app.untitledN', { n })
}

let tabSeq = 0
function newTabId(): string {
  tabSeq += 1
  return `t${Date.now().toString(36)}-${tabSeq}`
}

async function reportError(message: string, detail: string): Promise<void> {
  await window.api.dialog.message({ type: 'error', message, detail, buttons: [t('store.gotIt')] })
}

// ── 与主进程的同步（只在真正变化时发 IPC，避免每次击键都过一遍桥） ──

let lastDirtyFlag = false
let lastPathsKey = ''

function syncMain(tabs: readonly Tab[]): void {
  const dirty = tabs.some((t) => t.dirty)
  if (dirty !== lastDirtyFlag) {
    lastDirtyFlag = dirty
    void window.api.app.setDirty(dirty)
  }

  const paths = tabs.map((t) => t.path).filter((p): p is string => p !== null)
  const key = paths.join('\n')
  if (key !== lastPathsKey) {
    lastPathsKey = key
    void window.api.app.setOpenPaths(paths)
  }
}

// ── 自动保存 ──

const autoSaveTimers = new Map<string, number>()

function clearAutoSave(tabId: string): void {
  const timer = autoSaveTimers.get(tabId)
  if (timer !== undefined) {
    window.clearTimeout(timer)
    autoSaveTimers.delete(tabId)
  }
}

function scheduleAutoSave(tabId: string): void {
  const { autoSave, autoSaveDelay } = useEditorStore.getState()
  if (!autoSave) return
  clearAutoSave(tabId)
  autoSaveTimers.set(
    tabId,
    window.setTimeout(() => {
      autoSaveTimers.delete(tabId)
      const state = useEditorStore.getState()
      const tab = state.tabs.find((t) => t.id === tabId)
      // 有冲突时绝不自动覆盖磁盘，交给用户决定
      if (tab && tab.dirty && tab.path && !tab.conflict) void state.saveTab(tabId, { silent: true })
    }, autoSaveDelay)
  )
}

// ── 崩溃恢复快照（节流 5s，主进程正常退出时会删除快照） ──

let recoveryTimer: number | null = null
let recoveryWritten = false
let lastRecoveryKey = ''

function writeRecovery(): void {
  const tabs = useEditorStore.getState().tabs.filter((t) => t.dirty)

  if (tabs.length === 0) {
    if (recoveryWritten) {
      recoveryWritten = false
      lastRecoveryKey = ''
      void window.api.recovery.clear()
    }
    return
  }

  const key = JSON.stringify(tabs.map((t) => [t.path, t.title, t.content]))
  if (key === lastRecoveryKey) return
  lastRecoveryKey = key
  recoveryWritten = true

  void window.api.recovery.save({
    savedAt: Date.now(),
    entries: tabs.map((t) => ({
      docId: t.id,
      path: t.path,
      title: t.title,
      content: t.content,
      savedAt: Date.now()
    }))
  })
}

function scheduleRecovery(): void {
  if (recoveryTimer !== null) return
  recoveryTimer = window.setTimeout(() => {
    recoveryTimer = null
    writeRecovery()
  }, 5000)
}

// ── 初始化只跑一次 ──

let initPromise: Promise<void> | null = null

// ── 工作区刷新 ──

let treeRefreshTimer: number | null = null
let workspaceToken = 0

export const useEditorStore = create<EditorStore>((set, get) => {
  function makeTab(init: {
    path: string | null
    title?: string
    content: string
    savedContent?: string
    encoding?: Enc
    eol?: Eol
    mtimeMs?: number
  }): Tab {
    const savedContent = init.savedContent ?? init.content
    return {
      id: newTabId(),
      path: init.path,
      title: init.title ?? (init.path ? baseName(init.path) : nextUntitledTitle(get().tabs)),
      content: init.content,
      savedContent,
      encoding: init.encoding ?? 'utf8',
      eol: init.eol ?? 'lf',
      mtimeMs: init.mtimeMs ?? 0,
      dirty: init.content !== savedContent,
      conflict: null,
      reloadToken: 0
    }
  }

  function removeTabs(ids: readonly string[]): void {
    const remove = new Set(ids)
    if (remove.size === 0) return

    const { tabs, activeId } = get()
    for (const id of remove) {
      clearAutoSave(id)
      dropTabState(id)
    }

    const nextTabs = tabs.filter((t) => !remove.has(t.id))
    let nextActive = activeId

    if (activeId && remove.has(activeId)) {
      const index = tabs.findIndex((t) => t.id === activeId)
      nextActive = nextTabs[Math.min(index, nextTabs.length - 1)]?.id ?? null
    }

    set({ tabs: nextTabs, activeId: nextActive })
    pruneTabStates(nextTabs.map((t) => t.id))
    syncMain(nextTabs)
    scheduleRecovery()

    if (nextTabs.length === 0) get().newDocument()
  }

  return {
    tabs: [],
    activeId: null,
    theme: 'system',
    language: 'zh',
    spellcheck: true,
    systemDark: false,
    fontSize: 16,
    workspace: { root: null, tree: null, watchId: null, loading: false },
    sidebarVisible: true,
    sidebarView: 'files',
    menuBarVisible: true,
    formatToolbarVisible: true,
    focusMode: false,
    typewriter: false,
    autoSave: true,
    autoSaveDelay: 800,
    recentFiles: [],
    paletteOpen: false,
    preferencesOpen: false,
    aboutOpen: false,
    searchOpen: false,
    searchReplace: false,
    searchSeq: 0,
    recoveryPrompt: null,
    busy: false,
    sourceMode: false,

    init: () => {
      initPromise ??= (async () => {
        set({ busy: true })
        try {
          const [settings, snapshot] = await Promise.all([
            window.api.app.getSettings(),
            window.api.recovery.load()
          ])

          setI18nLanguage(settings.language)
          set({
            theme: settings.theme,
            language: settings.language,
            spellcheck: settings.spellcheck,
            fontSize: settings.fontSize,
            autoSave: settings.autoSave,
            autoSaveDelay: settings.autoSaveDelay,
            sidebarVisible: settings.sidebarVisible,
            menuBarVisible: settings.menuBarVisible,
            formatToolbarVisible: settings.formatToolbarVisible,
            recentFiles: settings.recentFiles,
            systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches
          })

          if (snapshot && snapshot.entries.length > 0) {
            recoveryWritten = true
            set({ recoveryPrompt: snapshot })
          }

          if (settings.workspaceRoot) {
            await get().openWorkspace(settings.workspaceRoot, {
              silentError: true,
              persist: false
            })
          }

          // 有崩溃恢复待确认时不自动建空文档，让用户先做选择
          if (get().tabs.length === 0 && !get().recoveryPrompt) get().newDocument()
        } catch (error) {
          await reportError(t('store.initFailed'), String(error))
          if (get().tabs.length === 0) get().newDocument()
        } finally {
          set({ busy: false })
        }
      })()
      return initPromise
    },

    newDocument: () => {
      const tabs = get().tabs
      const tab = makeTab({
        path: null,
        title: nextUntitledTitle(tabs),
        content: '',
        savedContent: ''
      })
      set({ tabs: [...tabs, tab], activeId: tab.id })
      syncMain(get().tabs)
    },

    openPath: async (path) => {
      const existing = get().tabs.find((t) => t.path && isSamePath(t.path, path))
      if (existing) {
        set({ activeId: existing.id })
        if (existing.path) get().touchRecent(existing.path)
        return
      }

      set({ busy: true })
      try {
        const file = await window.api.file.read(path)

        // 读取期间可能已被另一个入口打开
        const duplicate = get().tabs.find((t) => t.path && isSamePath(t.path, file.path))
        if (duplicate) {
          set({ activeId: duplicate.id })
          return
        }

        const tab = makeTab({
          path: file.path,
          content: file.content,
          savedContent: file.content,
          encoding: file.encoding,
          eol: file.eol,
          mtimeMs: file.mtimeMs
        })
        set({ tabs: [...get().tabs, tab], activeId: tab.id })
        syncMain(get().tabs)
        get().touchRecent(file.path)

        const root = get().workspace.root
        if (root && isUnder(file.path, root)) void get().refreshTree()
      } catch (error) {
        await reportError(t('store.openFileFailed'), `${path}\n${String(error)}`)
      } finally {
        set({ busy: false })
      }
    },

    openPaths: async (paths) => {
      for (const path of paths) await get().openPath(path)
    },

    activate: (id) => {
      if (get().tabs.some((t) => t.id === id)) set({ activeId: id })
    },

    closeTab: async (id) => {
      const tab = get().tabs.find((t) => t.id === id)
      if (!tab) return

      if (tab.dirty) {
        const { choice } = await window.api.dialog.confirmClose(tab.title)
        if (choice === 'cancel') return
        if (choice === 'save' && !(await get().saveTab(id))) return
      }
      removeTabs([id])
    },

    setEditorContent: (tabId, content) => {
      const tabs = get().tabs
      const tab = tabs.find((t) => t.id === tabId)
      if (!tab || tab.content === content) return

      set({
        tabs: tabs.map((t) =>
          t.id === tabId ? { ...t, content, dirty: content !== t.savedContent } : t
        )
      })
      scheduleAutoSave(tabId)
      scheduleRecovery()
      syncMain(get().tabs)
    },

    saveTab: async (id, opts) => {
      const tab = get().tabs.find((t) => t.id === id)
      if (!tab) return false

      if (!tab.path) {
        if (opts?.silent) return false
        return get().saveAs(id)
      }

      if (tab.conflict && !tab.conflict.deleted && !opts?.silent) {
        const { response } = await window.api.dialog.message({
          type: 'warning',
          message: t('store.overwriteTitle', { name: tab.title }),
          detail: t('store.overwriteDetail'),
          buttons: [t('store.overwrite'), t('common.cancel')]
        })
        if (response !== 0) return false
      }

      try {
        const written = tab.content
        const { mtimeMs } = await window.api.file.write(
          tab.path,
          written,
          tab.eol,
          tab.encoding
        )
        const current = get().tabs.find((t) => t.id === id)
        if (!current) return true

        // 写入期间用户可能继续编辑：此时不能让这次保存清掉新排的自动保存定时器
        const stillDirty = current.content !== written
        set({
          tabs: get().tabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  mtimeMs,
                  savedContent: written,
                  dirty: stillDirty,
                  conflict: null
                }
              : t
          )
        })
        if (stillDirty) scheduleAutoSave(id)
        else clearAutoSave(id)
        syncMain(get().tabs)
        scheduleRecovery()
        return true
      } catch (error) {
        await reportError(t('store.saveFailed'), `${tab.path}\n${String(error)}`)
        return false
      }
    },

    saveAs: async (id) => {
      const tab = get().tabs.find((t) => t.id === id)
      if (!tab) return false

      const picked = await window.api.dialog.saveFile({ defaultPath: tab.path ?? undefined })
      if (!picked.path) return false

      try {
        const written = tab.content
        const { mtimeMs } = await window.api.file.write(
          picked.path,
          written,
          tab.eol,
          tab.encoding
        )
        const current = get().tabs.find((t) => t.id === id)
        if (!current) return true

        const title = baseName(picked.path)
        const stillDirty = current.content !== written
        set({
          tabs: get().tabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  path: picked.path,
                  title,
                  mtimeMs,
                  savedContent: written,
                  dirty: stillDirty,
                  conflict: null
                }
              : t
          )
        })
        if (stillDirty) scheduleAutoSave(id)
        else clearAutoSave(id)
        syncMain(get().tabs)
        get().touchRecent(picked.path)
        scheduleRecovery()

        const root = get().workspace.root
        if (root && isUnder(picked.path, root)) void get().refreshTree()
        return true
      } catch (error) {
        await reportError(t('store.saveFailed'), `${picked.path}\n${String(error)}`)
        return false
      }
    },

    touchRecent: (path) => {
      const recentFiles = [path, ...get().recentFiles.filter((p) => !isSamePath(p, path))].slice(
        0,
        RECENT_LIMIT
      )
      set({ recentFiles })
      void window.api.app.patchSettings({ recentFiles })
    },

    setTheme: async (theme) => {
      set({ theme })
      reconfigureAllThemes()
      const patch: Partial<AppSettings> = { theme }
      await window.api.app.patchSettings(patch)
    },

    setLanguage: async (language) => {
      if (get().language === language) return
      setI18nLanguage(language)
      let untitled = 0
      const tabs = get().tabs.map((tab) => {
        if (tab.path) return tab
        untitled += 1
        const title =
          untitled === 1 ? t('app.untitled') : t('app.untitledN', { n: untitled })
        return tab.title === title ? tab : { ...tab, title }
      })
      set({ language, tabs })
      reconfigureAllEditorAttributes()
      await window.api.app.patchSettings({ language })
    },

    setSpellcheck: async (enabled) => {
      if (get().spellcheck === enabled) return
      set({ spellcheck: enabled })
      reconfigureAllEditorAttributes()
      await window.api.app.patchSettings({ spellcheck: enabled })
    },

    setSystemDark: (dark) => {
      if (get().systemDark === dark) return
      set({ systemDark: dark })
      if (get().theme === 'system') reconfigureAllThemes()
    },

    toggleSidebar: () => {
      const sidebarVisible = !get().sidebarVisible
      set({ sidebarVisible })
      void window.api.app.patchSettings({ sidebarVisible })
    },

    setSidebarView: (view) => {
      set({ sidebarView: view, sidebarVisible: true })
      void window.api.app.patchSettings({ sidebarVisible: true })
    },

    toggleOutline: () => {
      const { sidebarVisible, sidebarView } = get()
      if (sidebarVisible && sidebarView === 'outline') {
        set({ sidebarVisible: false })
        void window.api.app.patchSettings({ sidebarVisible: false })
        return
      }
      set({ sidebarView: 'outline', sidebarVisible: true })
      void window.api.app.patchSettings({ sidebarVisible: true })
    },

    toggleMenuBar: () => {
      get().setMenuBarVisible(!get().menuBarVisible)
    },

    setMenuBarVisible: (enabled) => {
      set({ menuBarVisible: enabled })
      void window.api.app.patchSettings({ menuBarVisible: enabled })
    },

    toggleFormatToolbar: () => {
      get().setFormatToolbarVisible(!get().formatToolbarVisible)
    },

    setFormatToolbarVisible: (enabled) => {
      set({ formatToolbarVisible: enabled })
      void window.api.app.patchSettings({ formatToolbarVisible: enabled })
    },

    toggleSourceMode: () => {
      const sourceMode = !get().sourceMode
      set({ sourceMode })
      reconfigureAllModes(sourceMode)
    },

    toggleFocusMode: () => {
      const focusMode = !get().focusMode
      set({ focusMode })
      reconfigureAllFocus(focusMode)
    },

    toggleTypewriter: () => {
      const typewriter = !get().typewriter
      set({ typewriter })
      reconfigureAllTypewriter(typewriter)
    },

    setAutoSave: (enabled) => {
      set({ autoSave: enabled })
      void window.api.app.patchSettings({ autoSave: enabled })
      if (!enabled) {
        for (const id of [...autoSaveTimers.keys()]) clearAutoSave(id)
      }
    },

    openWorkspaceDialog: async () => {
      const { path } = await window.api.dialog.openFolder({
        defaultPath: get().workspace.root ?? undefined
      })
      if (path) await get().openWorkspace(path)
    },

    openWorkspace: async (root, opts) => {
      const token = (workspaceToken += 1)
      const previous = get().workspace
      if (previous.watchId) void window.api.workspace.unwatch(previous.watchId)

      set({
        workspace: { root, tree: null, watchId: null, loading: true },
        // 启动时恢复上次工作区，应沿用用户上次的侧栏可见性
        ...(opts?.persist === false ? {} : { sidebarVisible: true })
      })

      try {
        const [tree, watch] = await Promise.all([
          window.api.workspace.scan(root),
          window.api.workspace.watch(root)
        ])

        if (token !== workspaceToken) {
          // 加载期间用户又换了文件夹，丢弃这次结果
          void window.api.workspace.unwatch(watch.watchId)
          return
        }

        set({
          workspace: { root, tree, watchId: watch.watchId, loading: false }
        })

        if (opts?.persist !== false) {
          void window.api.app.patchSettings({ workspaceRoot: root, sidebarVisible: true })
        }
      } catch (error) {
        if (token !== workspaceToken) return
        set({ workspace: { root: null, tree: null, watchId: null, loading: false } })
        if (!opts?.silentError) {
          await reportError(t('store.openFolderFailed'), `${root}\n${String(error)}`)
        }
      }
    },

    closeWorkspace: () => {
      workspaceToken += 1
      const { watchId } = get().workspace
      if (watchId) void window.api.workspace.unwatch(watchId)
      set({
        workspace: { root: null, tree: null, watchId: null, loading: false },
        sidebarVisible: false
      })
      void window.api.app.patchSettings({ workspaceRoot: null, sidebarVisible: false })
    },

    refreshTree: async () => {
      const { root, watchId, loading } = get().workspace
      if (!root) return
      if (loading) return

      try {
        const tree = await window.api.workspace.scan(root)
        const current = get().workspace
        if (current.root === root && current.watchId === watchId) {
          set({ workspace: { ...current, tree } })
        }
      } catch {
        // 目录可能刚被删除：保持现有树，避免闪成空白
      }
    },

    applyFsChanges: (watchId, changes) => {
      const { root, watchId: currentWatch } = get().workspace
      if (!root || currentWatch !== watchId || changes.length === 0) return
      if (treeRefreshTimer !== null) window.clearTimeout(treeRefreshTimer)
      treeRefreshTimer = window.setTimeout(() => {
        treeRefreshTimer = null
        void get().refreshTree()
      }, 250)
    },

    createNode: async (dir, name, kind) => {
      try {
        const { path } = await window.api.file.create(dir, name, kind)
        if (kind === 'file') {
          await get().openPath(path)
        } else {
          await get().refreshTree()
        }
        return path
      } catch (error) {
        await reportError(
          t(kind === 'file' ? 'store.createFileFailed' : 'store.createFolderFailed'),
          `${name}\n${String(error)}`
        )
        return null
      }
    },

    renameNode: async (from, to) => {
      try {
        await window.api.file.rename(from, to)
        const tabs = get().tabs.map((tab) => {
          if (!tab.path) return tab
          const next = remapPath(tab.path, from, to)
          if (!next) return tab
          return {
            ...tab,
            path: next,
            title: isSamePath(tab.path, from) ? baseName(next) : tab.title
          }
        })
        set({ tabs })
        syncMain(tabs)
        scheduleRecovery()
        await get().refreshTree()
        return true
      } catch (error) {
        await reportError(t('store.renameFailed'), `${baseName(from)}\n${String(error)}`)
        return false
      }
    },

    deleteNode: async (path) => {
      const affected = get().tabs.filter((t) => t.path && isUnder(t.path, path))
      const dirtyCount = affected.filter((t) => t.dirty).length
      const details = [t('store.deleteRecycle')]
      if (affected.length > 0) details.push(t('store.deleteCloseTabs', { n: affected.length }))
      if (dirtyCount > 0) details.push(t('store.deleteDirty', { n: dirtyCount }))

      const { response } = await window.api.dialog.message({
        type: 'warning',
        message: t('store.deleteTitle', { name: baseName(path) }),
        detail: details.join('\n'),
        buttons: [t('store.delete'), t('common.cancel')]
      })
      if (response !== 0) return false

      try {
        await window.api.file.remove(path)
        removeTabs(affected.map((t) => t.id))
        await get().refreshTree()
        return true
      } catch (error) {
        await reportError(t('store.deleteFailed'), `${path}\n${String(error)}`)
        return false
      }
    },

    revealNode: async (path) => {
      await window.api.file.reveal(path)
    },

    handleConflict: (path, info) => {
      const target = get().tabs.find((t) => t.path && isSamePath(t.path, path))
      if (!target) return
      const conflict: TabConflict = { mtimeMs: info.mtimeMs, deleted: info.deleted }
      set({
        tabs: get().tabs.map((t) => (t.id === target.id ? { ...t, conflict } : t))
      })
    },

    resolveConflict: async (id, action) => {
      if (action === 'reload') {
        await get().reloadTab(id)
        return
      }
      if (action === 'keep') {
        set({
          tabs: get().tabs.map((t) =>
            t.id === id ? { ...t, conflict: null, dirty: true } : t
          )
        })
        syncMain(get().tabs)
        scheduleRecovery()
        return
      }
      await get().saveTab(id)
    },

    reloadTab: async (id) => {
      const tab = get().tabs.find((t) => t.id === id)
      if (!tab?.path) return

      try {
        const file = await window.api.file.read(tab.path)
        // 先换 registry 里的 EditorState，再更新镜像；活动的 EditorView 由 reloadToken 驱动切换
        replaceTabContent(id, file.content)
        set({
          tabs: get().tabs.map((t) =>
            t.id === id
              ? {
                  ...t,
                  content: file.content,
                  savedContent: file.content,
                  encoding: file.encoding,
                  eol: file.eol,
                  mtimeMs: file.mtimeMs,
                  dirty: false,
                  conflict: null,
                  reloadToken: t.reloadToken + 1
                }
              : t
          )
        })
        syncMain(get().tabs)
        scheduleRecovery()
      } catch (error) {
        await reportError(t('store.reloadFailed'), `${tab.path}\n${String(error)}`)
      }
    },

    setPaletteOpen: (open) => set({ paletteOpen: open }),

    setPreferencesOpen: (open) => set({ preferencesOpen: open }),

    setAboutOpen: (open) => set({ aboutOpen: open }),

    openSearch: (replace = false) => {
      set({ searchOpen: true, searchReplace: replace, searchSeq: get().searchSeq + 1 })
    },

    closeSearch: () => {
      if (!get().searchOpen) return
      set({ searchOpen: false })
    },

    resolveRecovery: async (accept) => {
      const snapshot = get().recoveryPrompt
      set({ recoveryPrompt: null })
      if (!snapshot) return

      if (!accept) {
        recoveryWritten = false
        lastRecoveryKey = ''
        await window.api.recovery.clear()
        if (get().tabs.length === 0) get().newDocument()
        return
      }

      const tabs: Tab[] = []
      for (const entry of snapshot.entries) {
        let encoding: Enc = 'utf8'
        let eol: Eol = 'lf'
        let mtimeMs = 0
        let savedContent = ''

        if (entry.path) {
          try {
            const disk = await window.api.file.read(entry.path)
            encoding = disk.encoding
            eol = disk.eol
            mtimeMs = disk.mtimeMs
            savedContent = disk.content
          } catch {
            // 原文件已不存在：保留恢复内容，保存时会重新创建
          }
        }

        tabs.push(
          makeTab({
            path: entry.path,
            title: entry.path ? baseName(entry.path) : entry.title,
            content: entry.content,
            savedContent,
            encoding,
            eol,
            mtimeMs
          })
        )
      }

      if (tabs.length === 0) {
        if (get().tabs.length === 0) get().newDocument()
        return
      }

      set({ tabs, activeId: tabs[0].id })
      syncMain(tabs)
      await window.api.recovery.clear()
      recoveryWritten = false
      lastRecoveryKey = ''
      scheduleRecovery()
    }
  }
})

export function activeTabOf(state: Pick<EditorStore, 'tabs' | 'activeId'>): Tab | null {
  return state.tabs.find((t) => t.id === state.activeId) ?? null
}

/** 当前实际生效的深浅色 */
export function resolveDark(theme: ThemeMode, systemDark: boolean): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return systemDark
}
