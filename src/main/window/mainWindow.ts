import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  Menu,
  nativeTheme,
  shell,
  type MenuItemConstructorOptions
} from 'electron'
import { is } from '@electron-toolkit/utils'
import { CH } from '@shared/ipc/channels'
import { mainT } from '../i18n'
import { getSettings } from '../services/settingsService'
import { isDocumentDirty } from './closeGuard'

export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

const DEFAULT_BOUNDS: WindowBounds = { width: 1200, height: 820 }
const TITLEBAR_HEIGHT = 36

const TITLEBAR_COLORS = {
  light: { color: '#f7f7f7', symbolColor: '#4a4a4a' },
  dark: { color: '#1e1e1e', symbolColor: '#cfcfcf' }
} as const

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function statePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

/** 打包后图标随 extraResources 放在 resources/，开发时直接读 build/ */
function windowIcon(): string | undefined {
  const file = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'icon-window.png')
  return existsSync(file) ? file : undefined
}

export async function loadBounds(): Promise<WindowBounds> {
  try {
    const raw = await fs.readFile(statePath(), 'utf8')
    const parsed = JSON.parse(raw) as WindowBounds
    if (Number.isFinite(parsed.width) && Number.isFinite(parsed.height)) return parsed
  } catch {
    // 首次启动或状态文件损坏时回落默认尺寸
  }
  return { ...DEFAULT_BOUNDS }
}

let saveTimer: NodeJS.Timeout | null = null

function scheduleSave(win: BrowserWindow): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (win.isDestroyed()) return
    const bounds = win.getNormalBounds()
    const payload: WindowBounds = { ...bounds, maximized: win.isMaximized() }
    fs.writeFile(statePath(), JSON.stringify(payload), 'utf8').catch(() => undefined)
  }, 400)
}

export function updateTitleBarOverlay(dark: boolean): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  const theme = dark ? TITLEBAR_COLORS.dark : TITLEBAR_COLORS.light
  try {
    win.setTitleBarOverlay({ ...theme, height: TITLEBAR_HEIGHT })
  } catch {
    // Linux 等平台不支持 titleBarOverlay，忽略
  }
}

export function createMainWindow(initialBounds: WindowBounds): BrowserWindow {
  const win = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: 680,
    minHeight: 460,
    show: false,
    icon: windowIcon(),
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      ...(nativeTheme.shouldUseDarkColors ? TITLEBAR_COLORS.dark : TITLEBAR_COLORS.light),
      height: TITLEBAR_HEIGHT
    },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      // 自动保存与崩溃恢复依赖定时器，窗口最小化后也必须照常运行
      backgroundThrottling: false
    }
  })

  mainWindow = win

  win.on('ready-to-show', () => {
    if (initialBounds.maximized) win.maximize()
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 右键菜单：拼写建议 + 系统剪贴板操作（原生菜单不显示，但 context menu 仍可用）
  win.webContents.on('context-menu', (_event, params) => {
    void (async () => {
      const { language } = await getSettings()
      const label = (key: Parameters<typeof mainT>[1]): string => mainT(language, key)
      const items: MenuItemConstructorOptions[] = []

      if (params.misspelledWord) {
        if (params.dictionarySuggestions.length > 0) {
          for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
            items.push({
              label: suggestion,
              click: () => win.webContents.replaceMisspelling(suggestion)
            })
          }
        } else {
          items.push({ label: label('context.noSuggestions'), enabled: false })
        }
        items.push(
          { type: 'separator' },
          {
            label: label('context.addToDictionary'),
            click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
          },
          { type: 'separator' }
        )
      }

      if (params.isEditable) {
        items.push(
          { label: label('context.cut'), role: 'cut' },
          { label: label('context.copy'), role: 'copy' },
          { label: label('context.paste'), role: 'paste' },
          { type: 'separator' },
          { label: label('context.selectAll'), role: 'selectAll' }
        )
      } else if (params.selectionText.trim()) {
        items.push({ label: label('context.copy'), role: 'copy' })
      }

      if (items.length === 0) return
      Menu.buildFromTemplate(items).popup({ window: win })
    })()
  })

  const notifyState = (): void => {
    if (win.isDestroyed()) return
    win.webContents.send(CH.eventWindowState, {
      maximized: win.isMaximized(),
      fullScreen: win.isFullScreen()
    })
  }

  win.on('maximize', () => {
    notifyState()
    scheduleSave(win)
  })
  win.on('unmaximize', () => {
    notifyState()
    scheduleSave(win)
  })
  win.on('enter-full-screen', notifyState)
  win.on('leave-full-screen', notifyState)
  win.on('resize', () => scheduleSave(win))
  win.on('move', () => scheduleSave(win))

  // 有未保存内容时先拦下，交给渲染进程弹确认框
  win.on('close', (event) => {
    if (!isDocumentDirty()) return
    event.preventDefault()
    win.webContents.send(CH.eventCloseRequest, {})
  })

  win.on('closed', () => {
    mainWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
