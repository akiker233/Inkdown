import { app, dialog, type BrowserWindow } from 'electron'
import { mainT, type MainTextKey } from '../i18n'
import { getMainWindow } from '../window/mainWindow'
import { getSettings } from './settingsService'

const AUTO_CHECK_DELAY_MS = 10_000

let initialized = false
let checking = false

function feedUrl(updateFeedUrl: string | null): string | null {
  const configured = process.env.INKDOWN_UPDATE_URL ?? updateFeedUrl ?? ''
  return configured.trim() || null
}

async function notify(
  win: BrowserWindow,
  type: 'info' | 'warning' | 'error',
  message: string,
  detail: string,
  buttons: string[]
): Promise<number> {
  const { response } = await dialog.showMessageBox(win, { type, message, detail, buttons })
  return response
}

/**
 * 自动更新管道：默认关闭，只有设置里开启 autoUpdate 且配置了更新源才会在启动后检查。
 * 更新源优先级：环境变量 INKDOWN_UPDATE_URL > 设置项 updateFeedUrl。
 * Windows 上 NSIS 更新由 electron-updater 负责，发布包必须签名后才能通过校验。
 */
export async function initAutoUpdate(): Promise<void> {
  if (initialized) return
  initialized = true
  const settings = await getSettings()
  if (!settings.autoUpdate || !feedUrl(settings.updateFeedUrl) || !app.isPackaged) return
  const timer = setTimeout(() => {
    void checkForUpdates({ manual: false })
  }, AUTO_CHECK_DELAY_MS)
  timer.unref?.()
}

export async function checkForUpdates(options: { manual: boolean }): Promise<void> {
  const win = getMainWindow()
  if (!win) return

  const settings = await getSettings()
  const t = (key: MainTextKey, params?: Record<string, string | number>): string =>
    mainT(settings.language, key, params)

  if (checking) {
    if (options.manual) {
      await notify(win, 'info', t('update.busyTitle'), t('update.busyDetail'), [t('update.ok')])
    }
    return
  }

  if (!app.isPackaged) {
    if (options.manual) {
      await notify(win, 'info', t('update.unavailableTitle'), t('update.devDetail'), [
        t('update.ok')
      ])
    }
    return
  }

  const feed = feedUrl(settings.updateFeedUrl)
  if (!feed) {
    if (options.manual) {
      await notify(win, 'info', t('update.unavailableTitle'), t('update.noFeedDetail'), [
        t('update.ok')
      ])
    }
    return
  }

  checking = true
  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = false
    autoUpdater.setFeedURL({ provider: 'generic', url: feed })

    const result = await autoUpdater.checkForUpdates()
    if (!result) {
      if (options.manual) {
        await notify(
          win,
          'info',
          t('update.latestTitle'),
          t('update.latestDetail', { version: app.getVersion() }),
          [t('update.ok')]
        )
      }
      return
    }

    const version = result.updateInfo.version
    const download = await notify(
      win,
      'info',
      t('update.availableTitle'),
      t('update.availableDetail', { current: app.getVersion(), version }),
      [t('update.download'), t('update.later')]
    )
    if (download !== 0) return

    await autoUpdater.downloadUpdate()
    const install = await notify(
      win,
      'info',
      t('update.downloadedTitle'),
      t('update.downloadedDetail', { version }),
      [t('update.restart'), t('update.later')]
    )
    if (install === 0) autoUpdater.quitAndInstall()
  } catch (error) {
    if (options.manual) {
      await notify(win, 'error', t('update.errorTitle'), t('update.errorDetail', {
        error: error instanceof Error ? error.message : String(error)
      }), [t('update.ok')])
    }
  } finally {
    checking = false
  }
}
