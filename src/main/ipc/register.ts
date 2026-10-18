import { app, clipboard, nativeTheme } from 'electron'
import { CH } from '@shared/ipc/channels'
import type { AppInfo } from '@shared/ipc/contract'
import {
  getFileAssociationState,
  openDefaultAppsSettings,
  setContextMenu,
  syncFileAssociations
} from '../services/fileAssociationService'
import { getSettings, patchSettings } from '../services/settingsService'
import { checkForUpdates } from '../services/updateService'
import { setDocumentDirty } from '../window/closeGuard'
import { getMainWindow } from '../window/mainWindow'
import { buildAppMenu, serializeAppMenu, syncAppMenuViewState } from '../window/menu'
import { registerAssetHandlers } from './asset.handlers'
import { registerDialogHandlers } from './dialog.handlers'
import { registerExportHandlers } from './export.handlers'
import { registerFsHandlers } from './fs.handlers'
import { handle } from './handle'
import { registerLaunchHandlers } from './launch.handlers'
import { registerRecoveryHandlers } from './recovery.handlers'
import { registerWindowHandlers } from './window.handlers'
import { registerWorkspaceHandlers } from './workspace.handlers'

const REPOSITORY_URL = 'https://github.com/akiker233/Inkdown'

export function registerAllHandlers(): void {
  registerFsHandlers()
  registerAssetHandlers()
  registerDialogHandlers()
  registerExportHandlers()
  registerWindowHandlers()
  registerWorkspaceHandlers()
  registerRecoveryHandlers()
  registerLaunchHandlers()

  handle(CH.appGetInfo, (): AppInfo => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      locale: app.getLocale(),
      userDataPath: app.getPath('userData'),
      repositoryUrl: REPOSITORY_URL
    }
  })

  handle(CH.appCopyText, (req) => {
    clipboard.writeText(req.text)
  })

  handle(CH.appGetSettings, () => getSettings())

  handle(CH.appPatchSettings, async (patch) => {
    const next = await patchSettings(patch)
    if (patch.theme) nativeTheme.themeSource = patch.theme
    const win = getMainWindow()
    if (
      win &&
      (patch.language !== undefined ||
        patch.spellcheck !== undefined ||
        patch.menuBarVisible !== undefined ||
        patch.formatToolbarVisible !== undefined)
    ) {
      buildAppMenu(win, next.language, next.spellcheck, {
        menuBarVisible: next.menuBarVisible,
        formatToolbarVisible: next.formatToolbarVisible
      })
    }
    if (patch.language !== undefined && next.markdownContextMenu) {
      // 右键菜单文案跟随界面语言
      await syncFileAssociations()
    }
    return next
  })

  handle(CH.fileAssocGet, () => getFileAssociationState())

  handle(CH.fileAssocSetContextMenu, ({ enabled }) => setContextMenu(enabled))

  handle(CH.fileAssocOpenDefaultApps, () => openDefaultAppsSettings())

  handle(CH.appSetDirty, (req) => {
    setDocumentDirty(req.dirty)
  })

  handle(CH.appGetMenu, () => serializeAppMenu())

  handle(CH.appSyncMenuViewState, (state) => syncAppMenuViewState(state))

  handle(CH.appEditAction, ({ action }) => {
    const contents = getMainWindow()?.webContents
    if (!contents) return
    if (action === 'cut') contents.cut()
    else if (action === 'copy') contents.copy()
    else contents.paste()
  })

  handle(CH.appZoom, ({ direction }) => {
    const contents = getMainWindow()?.webContents
    if (!contents) return 0
    if (direction === 'reset') {
      contents.setZoomLevel(0)
      return 0
    }
    const next = Math.min(5, Math.max(-5, contents.getZoomLevel() + (direction === 'in' ? 0.5 : -0.5)))
    contents.setZoomLevel(next)
    return next
  })

  handle(CH.appCheckUpdates, ({ silent }) => checkForUpdates({ manual: true, silent }))
}
