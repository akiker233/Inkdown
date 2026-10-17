import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { BrowserWindow, app, nativeTheme } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { CH } from '@shared/ipc/channels'
import { queueLaunchTargets } from './ipc/launch.handlers'
import { registerAllHandlers } from './ipc/register'
import { registerAssetProtocol, registerAssetScheme } from './services/assetProtocol'
import { syncFileAssociations } from './services/fileAssociationService'
import { clearRecovery } from './services/recoveryService'
import { getSettings } from './services/settingsService'
import { initAutoUpdate } from './services/updateService'
import { closeAllWatchers } from './services/workspaceService'
import {
  createMainWindow,
  getMainWindow,
  loadBounds,
  updateTitleBarOverlay
} from './window/mainWindow'
import { buildAppMenu } from './window/menu'

const MD_EXT_RE = /\.(md|markdown|mdown|mkd|mdx)$/i

// 必须在 app ready 之前注册
registerAssetScheme()

interface LaunchTargets {
  files: string[]
  folder: string | null
}

/** 从命令行参数里挑出要打开的文件与文件夹（文件关联双击、拖到 exe 上） */
function extractTargets(argv: string[]): LaunchTargets {
  const files: string[] = []
  let folder: string | null = null

  for (const arg of argv) {
    if (arg.startsWith('-')) continue
    const absolute = resolve(arg)
    let isDir = false
    try {
      isDir = statSync(absolute).isDirectory()
    } catch {
      // 路径不存在时，仍按扩展名当作文件交给渲染进程去报错
    }
    if (isDir) {
      folder = absolute
    } else if (MD_EXT_RE.test(arg)) {
      files.push(absolute)
    }
  }

  return { files, folder }
}

function dispatchTargets(win: BrowserWindow, targets: LaunchTargets): void {
  if (targets.folder) {
    win.webContents.send(CH.eventOpenFolder, { path: targets.folder })
  }
  if (targets.files.length > 0) {
    win.webContents.send(CH.eventOpenFiles, { paths: targets.files })
  }
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
    dispatchTargets(win, extractTargets(argv.slice(1)))
  })

  void app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.inkdown.app')
    app.on('browser-window-created', (_event, window) => optimizer.watchWindowShortcuts(window))

    const settings = await getSettings()
    nativeTheme.themeSource = settings.theme

    registerAllHandlers()
    registerAssetProtocol()

    const bounds = await loadBounds()
    const win = createMainWindow(bounds)
    buildAppMenu(win, settings.language, settings.spellcheck, {
      sidebarVisible: settings.sidebarVisible,
      menuBarVisible: settings.menuBarVisible,
      formatToolbarVisible: settings.formatToolbarVisible
    })
    void initAutoUpdate()
    void syncFileAssociations()

    nativeTheme.on('updated', () => {
      const dark = nativeTheme.shouldUseDarkColors
      updateTitleBarOverlay(dark)
      getMainWindow()?.webContents.send(CH.eventThemeSystem, { dark })
    })

    // 冷启动由文件关联带入的路径：先排队，渲染进程订阅完成后主动拉取
    queueLaunchTargets(extractTargets(process.argv.slice(app.isPackaged ? 1 : 2)))

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(bounds)
    })
  })

  // 能走到 will-quit 说明是正常退出：清掉崩溃恢复快照，下次启动就不该再提示
  app.on('will-quit', () => {
    void clearRecovery()
    void closeAllWatchers()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
