import { useEffect } from 'react'
import type { ExportFormat } from '@shared/types/export'
import type { MenuCommandId } from '@shared/types/menu'
import {
  insertCodeFence,
  insertHr,
  insertImage,
  insertLink,
  insertMathBlock,
  insertTable,
  redoCommand,
  setHeading,
  selectAllCommand,
  toggleBold,
  toggleHighlight,
  toggleInlineCode,
  toggleItalic,
  toggleList,
  toggleQuote,
  toggleStrike,
  undoCommand
} from '../editor/commands'
import { t } from '../i18n'
import { activeTabOf, useEditorStore } from './store/editorStore'

// 导出链路会带进 markdown-it / KaTeX / highlight.js，按需加载避免拖慢启动
async function runExportCommand(format: ExportFormat): Promise<void> {
  const { exportDocument } = await import('../export/run')
  await exportDocument(format)
}

/** 主进程拦下关闭后走这里：逐个确认脏标签 → 保存/丢弃 → 再真正关闭 */
async function handleCloseRequest(): Promise<void> {
  const store = useEditorStore.getState()
  const dirtyTabs = store.tabs.filter((t) => t.dirty)

  for (const tab of dirtyTabs) {
    const { choice } = await window.api.dialog.confirmClose(tab.title)
    if (choice === 'cancel') return
    if (choice === 'save' && !(await store.saveTab(tab.id))) return
  }

  await window.api.window.forceClose()
}

export async function executeMenuCommand(command: MenuCommandId): Promise<void> {
  const store = useEditorStore.getState()
  const active = activeTabOf(store)

  switch (command) {
    case 'file.new':
      store.newDocument()
      break
    case 'file.open': {
      const { paths } = await window.api.dialog.openFile({ multiple: true })
      if (paths.length > 0) await store.openPaths(paths)
      break
    }
    case 'file.openFolder':
      await store.openWorkspaceDialog()
      break
    case 'file.quickOpen':
      store.setPaletteOpen(true)
      break
    case 'file.save':
      if (active) await store.saveTab(active.id)
      break
    case 'file.saveAs':
      if (active) await store.saveAs(active.id)
      break
    case 'file.closeTab':
      if (active) await store.closeTab(active.id)
      break
    case 'file.print':
      await (await import('../export/run')).printDocument()
      break
    case 'export.html':
      await runExportCommand('html')
      break
    case 'export.pdf':
      await runExportCommand('pdf')
      break
    case 'export.png':
      await runExportCommand('png')
      break
    case 'export.docx':
      await runExportCommand('docx')
      break
    case 'export.latex':
      await runExportCommand('latex')
      break
    case 'export.epub':
      await runExportCommand('epub')
      break
    case 'edit.undo':
      undoCommand()
      break
    case 'edit.redo':
      redoCommand()
      break
    case 'edit.cut':
      await window.api.app.editAction('cut')
      break
    case 'edit.copy':
      await window.api.app.editAction('copy')
      break
    case 'edit.paste':
      await window.api.app.editAction('paste')
      break
    case 'edit.selectAll':
      selectAllCommand()
      break
    case 'edit.find':
      store.openSearch(false)
      break
    case 'edit.replace':
      store.openSearch(true)
      break
    case 'paragraph.heading1':
      setHeading(1)
      break
    case 'paragraph.heading2':
      setHeading(2)
      break
    case 'paragraph.heading3':
      setHeading(3)
      break
    case 'paragraph.heading4':
      setHeading(4)
      break
    case 'paragraph.heading5':
      setHeading(5)
      break
    case 'paragraph.heading6':
      setHeading(6)
      break
    case 'paragraph.paragraph':
      setHeading(0)
      break
    case 'paragraph.quote':
      toggleQuote()
      break
    case 'paragraph.orderedList':
      toggleList('ordered')
      break
    case 'paragraph.bulletList':
      toggleList('bullet')
      break
    case 'paragraph.taskList':
      toggleList('task')
      break
    case 'paragraph.table':
      insertTable()
      break
    case 'paragraph.codeFence':
      insertCodeFence()
      break
    case 'paragraph.mathBlock':
      insertMathBlock()
      break
    case 'paragraph.hr':
      insertHr()
      break
    case 'format.bold':
      toggleBold()
      break
    case 'format.italic':
      toggleItalic()
      break
    case 'format.strike':
      toggleStrike()
      break
    case 'format.highlight':
      toggleHighlight()
      break
    case 'format.inlineCode':
      toggleInlineCode()
      break
    case 'format.hyperlink':
      insertLink()
      break
    case 'format.image':
      await insertImage()
      break
    case 'view.toggleSidebar':
      store.toggleSidebar()
      break
    case 'view.toggleOutline':
      store.toggleOutline()
      break
    case 'view.toggleMenuBar':
      store.toggleMenuBar()
      break
    case 'view.toggleFormatToolbar':
      store.toggleFormatToolbar()
      break
    case 'view.sourceCode':
      store.toggleSourceMode()
      break
    case 'view.focusMode':
      store.toggleFocusMode()
      break
    case 'view.typewriter':
      store.toggleTypewriter()
      break
    case 'view.fullscreen':
      await window.api.window.toggleFullScreen()
      break
    case 'view.zoomIn':
      await window.api.app.zoom('in')
      break
    case 'view.zoomOut':
      await window.api.app.zoom('out')
      break
    case 'view.resetZoom':
      await window.api.app.zoom('reset')
      break
    case 'theme.light':
      await store.setTheme('light')
      break
    case 'theme.dark':
      await store.setTheme('dark')
      break
    case 'theme.toggle':
      await store.setTheme('system')
      break
    case 'lang.zh':
      await store.setLanguage('zh')
      break
    case 'lang.en':
      await store.setLanguage('en')
      break
    case 'spellcheck.toggle':
      await store.setSpellcheck(!store.spellcheck)
      break
    case 'app.preferences':
      useEditorStore.getState().setPreferencesOpen(true)
      break
    case 'app.about': {
      const info = await window.api.app.getInfo()
      await window.api.dialog.message({
        type: 'info',
        message: t('about.message', { version: info.version }),
        detail: t('about.detail'),
        buttons: [t('store.gotIt')]
      })
      break
    }
    case 'help.checkUpdates':
      await window.api.app.checkUpdates()
      break
    default:
      break
  }
}

export function useAppCommands(): void {
  useEffect(() => {
    const offMenu = window.api.on('event:menu-command', ({ command }) => {
      void executeMenuCommand(command)
    })
    const offOpenFiles = window.api.on('event:open-files', ({ paths }) => {
      void useEditorStore.getState().openPaths(paths)
    })
    const offOpenFolder = window.api.on('event:open-folder', ({ path }) => {
      void useEditorStore.getState().openWorkspace(path)
    })
    const offFsChanged = window.api.on('event:fs-changed', ({ watchId, changes }) => {
      useEditorStore.getState().applyFsChanges(watchId, changes)
    })
    const offConflict = window.api.on('event:file-conflict', ({ path, mtimeMs, deleted }) => {
      useEditorStore.getState().handleConflict(path, { mtimeMs, deleted })
    })
    const offTheme = window.api.on('event:theme-system', ({ dark }) => {
      useEditorStore.getState().setSystemDark(dark)
    })
    const offClose = window.api.on('event:close-request', () => {
      void handleCloseRequest()
    })

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onMediaChange = (event: MediaQueryListEvent): void => {
      useEditorStore.getState().setSystemDark(event.matches)
    }
    media.addEventListener('change', onMediaChange)

    // 冷启动路径：等设置载入后主动拉取，避免主进程推送早于订阅
    void (async () => {
      const store = useEditorStore.getState()
      await store.init()
      const targets = await window.api.app.consumeLaunchTargets()
      if (targets.folder) await store.openWorkspace(targets.folder, { silentError: true })
      if (targets.files.length > 0) await store.openPaths(targets.files)
    })()

    return () => {
      offMenu()
      offOpenFiles()
      offOpenFolder()
      offFsChanged()
      offConflict()
      offTheme()
      offClose()
      media.removeEventListener('change', onMediaChange)
    }
  }, [])
}
