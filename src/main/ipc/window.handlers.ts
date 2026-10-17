import { CH } from '@shared/ipc/channels'
import { setDocumentDirty } from '../window/closeGuard'
import { getMainWindow } from '../window/mainWindow'
import { handle } from './handle'

export function registerWindowHandlers(): void {
  handle(CH.windowMinimize, () => {
    getMainWindow()?.minimize()
  })

  handle(CH.windowToggleMaximize, () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  handle(CH.windowClose, () => {
    getMainWindow()?.close()
  })

  handle(CH.windowToggleFullScreen, () => {
    const win = getMainWindow()
    if (!win) return
    win.setFullScreen(!win.isFullScreen())
  })

  handle(CH.windowForceClose, () => {
    setDocumentDirty(false)
    getMainWindow()?.close()
  })

  handle(CH.windowGetState, () => {
    const win = getMainWindow()
    return {
      maximized: win?.isMaximized() ?? false,
      fullScreen: win?.isFullScreen() ?? false,
      platform: process.platform
    }
  })
}
