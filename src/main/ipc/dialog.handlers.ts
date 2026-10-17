import { dirname } from 'node:path'
import { dialog, type MessageBoxOptions, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { CH } from '@shared/ipc/channels'
import type { AppLanguage } from '@shared/ipc/contract'
import { mainT } from '../i18n'
import { getSettings, patchSettings } from '../services/settingsService'
import { getMainWindow } from '../window/mainWindow'
import { handle } from './handle'

function mdFilters(language: AppLanguage): OpenDialogOptions['filters'] {
  return [
    { name: mainT(language, 'dialog.filterMarkdown'), extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
    { name: mainT(language, 'dialog.filterText'), extensions: ['txt'] },
    { name: mainT(language, 'dialog.filterAll'), extensions: ['*'] }
  ]
}

function imageFilters(language: AppLanguage): OpenDialogOptions['filters'] {
  return [
    {
      name: mainT(language, 'dialog.filterImages'),
      extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']
    },
    { name: mainT(language, 'dialog.filterAll'), extensions: ['*'] }
  ]
}

export function registerDialogHandlers(): void {
  handle(CH.dialogOpenFile, async (req) => {
    const win = getMainWindow()
    const settings = await getSettings()
    const image = req.kind === 'image'
    const options: OpenDialogOptions = {
      title: mainT(settings.language, image ? 'dialog.openImage' : 'dialog.openMarkdown'),
      defaultPath: req.defaultPath ?? settings.lastDir ?? undefined,
      filters: image ? imageFilters(settings.language) : mdFilters(settings.language),
      properties: req.multiple ? ['openFile', 'multiSelections'] : ['openFile']
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { paths: [] }
    await patchSettings({ lastDir: dirname(result.filePaths[0]) })
    return { paths: result.filePaths }
  })

  handle(CH.dialogOpenFolder, async (req) => {
    const win = getMainWindow()
    const settings = await getSettings()
    const options: OpenDialogOptions = {
      title: mainT(settings.language, 'dialog.openFolder'),
      defaultPath: req.defaultPath ?? settings.workspaceRoot ?? settings.lastDir ?? undefined,
      properties: ['openDirectory', 'createDirectory']
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { path: null }
    return { path: result.filePaths[0] }
  })

  handle(CH.dialogSaveFile, async (req) => {
    const win = getMainWindow()
    const settings = await getSettings()
    const options: SaveDialogOptions = {
      title: mainT(settings.language, 'dialog.saveAs'),
      defaultPath: req.defaultPath ?? settings.lastDir ?? undefined,
      filters: mdFilters(settings.language)
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { path: null }
    await patchSettings({ lastDir: dirname(result.filePath) })
    return { path: result.filePath }
  })

  handle(CH.dialogConfirmClose, async (req) => {
    const win = getMainWindow()
    const settings = await getSettings()
    const language = settings.language
    const options: MessageBoxOptions = {
      type: 'warning',
      buttons: [
        mainT(language, 'dialog.save'),
        mainT(language, 'dialog.dontSave'),
        mainT(language, 'dialog.cancel')
      ],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      message: mainT(language, 'dialog.confirmClose', { name: req.fileName }),
      detail: mainT(language, 'dialog.confirmCloseDetail')
    }
    const { response } = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    if (response === 0) return { choice: 'save' as const }
    if (response === 1) return { choice: 'discard' as const }
    return { choice: 'cancel' as const }
  })

  handle(CH.dialogMessage, async (req) => {
    const win = getMainWindow()
    const options: MessageBoxOptions = {
      type: req.type,
      message: req.message,
      detail: req.detail,
      buttons: req.buttons,
      noLink: true
    }
    const { response } = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    return { response }
  })
}
