import { app, dialog, shell, type BrowserWindow } from 'electron'
import type { AppSettings } from '@shared/ipc/contract'
import type { UpdateCheckResult, UpdateSource } from '@shared/types/update'
import { isNewerVersion, normalizeVersion } from '@shared/update/version'
import { mainT, type MainTextKey } from '../i18n'
import { getMainWindow } from '../window/mainWindow'
import { getSettings, patchSettings } from './settingsService'

const AUTO_CHECK_DELAY_MS = 10_000
const GITHUB_API_BASE = (process.env.INKDOWN_UPDATE_API_BASE ?? 'https://api.github.com').replace(
  /\/+$/,
  ''
)
const GITHUB_REPO = process.env.INKDOWN_UPDATE_REPO ?? 'akiker233/Inkdown'

interface GitHubRelease {
  tag_name?: string
  name?: string | null
  html_url?: string
  published_at?: string | null
}

type Translator = (key: MainTextKey, params?: Record<string, string | number>) => string

let initialized = false
let checking = false

function feedUrl(updateFeedUrl: string | null): string | null {
  const configured = process.env.INKDOWN_UPDATE_URL ?? updateFeedUrl ?? ''
  return configured.trim() || null
}

function isPortable(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE)
}

/** 发布页地址来自远端响应，只允许 https 再交给系统浏览器 */
function safeReleaseUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function baseResult(currentVersion: string, source: UpdateSource): UpdateCheckResult {
  return {
    status: 'up-to-date',
    source,
    currentVersion,
    latestVersion: currentVersion,
    releaseUrl: null,
    releaseName: null,
    publishedAt: null,
    canAutoInstall: false,
    error: null
  }
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

async function fetchLatestRelease(t: Translator): Promise<GitHubRelease> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${GITHUB_REPO}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Inkdown/${app.getVersion()}`
    },
    signal: AbortSignal.timeout(15_000)
  })

  if (response.status === 404) throw new Error(t('update.noReleaseDetail'))
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} ${response.statusText}`)
  }

  const release = (await response.json()) as GitHubRelease
  if (!release.tag_name || !safeReleaseUrl(release.html_url)) {
    throw new Error(t('update.noReleaseDetail'))
  }
  return release
}

async function checkGitHub(
  t: Translator,
  settings: AppSettings,
  options: { manual: boolean; silent: boolean },
  win: BrowserWindow | null
): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const result = baseResult(currentVersion, 'github')

  try {
    const release = await fetchLatestRelease(t)
    const latestVersion = normalizeVersion(release.tag_name as string)
    const available = isNewerVersion(latestVersion, currentVersion)

    result.status = available ? 'available' : 'up-to-date'
    result.latestVersion = latestVersion
    result.releaseUrl = safeReleaseUrl(release.html_url)
    result.releaseName = release.name ?? release.tag_name ?? null
    result.publishedAt = release.published_at ?? null

    if (!win || options.silent) return result

    if (available) {
      if (!options.manual && settings.dismissedUpdateVersion === latestVersion) return result

      const choice = await notify(
        win,
        'info',
        t('update.availableTitle'),
        t('update.availablePageDetail', { current: currentVersion, version: latestVersion }),
        [t('update.openDownload'), t('update.later')]
      )
      if (choice === 0 && result.releaseUrl) {
        await shell.openExternal(result.releaseUrl)
      } else if (!options.manual) {
        await patchSettings({ dismissedUpdateVersion: latestVersion })
      }
    } else if (options.manual) {
      await notify(
        win,
        'info',
        t('update.latestTitle'),
        t('update.latestDetail', { version: currentVersion }),
        [t('update.ok')]
      )
    }

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    result.status = 'error'
    result.error = message
    if (win && options.manual && !options.silent) {
      await notify(win, 'error', t('update.errorTitle'), t('update.errorDetail', { error: message }), [
        t('update.ok')
      ])
    }
    return result
  }
}

async function checkGenericFeed(
  feed: string,
  t: Translator,
  settings: AppSettings,
  options: { manual: boolean; silent: boolean },
  win: BrowserWindow | null
): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const result = baseResult(currentVersion, 'generic')
  result.canAutoInstall = true

  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = false
    autoUpdater.setFeedURL({ provider: 'generic', url: feed })

    const checked = await autoUpdater.checkForUpdates()
    const latestVersion = checked?.updateInfo.version
      ? normalizeVersion(checked.updateInfo.version)
      : currentVersion
    const available = isNewerVersion(latestVersion, currentVersion)

    result.status = available ? 'available' : 'up-to-date'
    result.latestVersion = latestVersion

    if (!win || options.silent) return result

    if (!available) {
      if (options.manual) {
        await notify(
          win,
          'info',
          t('update.latestTitle'),
          t('update.latestDetail', { version: currentVersion }),
          [t('update.ok')]
        )
      }
      return result
    }

    if (!options.manual && settings.dismissedUpdateVersion === latestVersion) return result

    const choice = await notify(
      win,
      'info',
      t('update.availableTitle'),
      t('update.availableDetail', { current: currentVersion, version: latestVersion }),
      [t('update.download'), t('update.later')]
    )
    if (choice !== 0) {
      if (!options.manual) await patchSettings({ dismissedUpdateVersion: latestVersion })
      return result
    }

    await autoUpdater.downloadUpdate()
    const install = await notify(
      win,
      'info',
      t('update.downloadedTitle'),
      t('update.downloadedDetail', { version: latestVersion }),
      [t('update.restart'), t('update.later')]
    )
    if (install === 0) autoUpdater.quitAndInstall()
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    result.status = 'error'
    result.error = message
    if (win && options.manual && !options.silent) {
      await notify(win, 'error', t('update.errorTitle'), t('update.errorDetail', { error: message }), [
        t('update.ok')
      ])
    }
    return result
  }
}

/**
 * 默认从 GitHub Releases 检查更新；便携版与开发模式会打开下载页面，安装版在配置了
 * generic 更新源时可由 electron-updater 下载并安装。
 */
export async function checkForUpdates(options: {
  manual: boolean
  silent?: boolean
}): Promise<UpdateCheckResult> {
  const win = getMainWindow()
  const settings = await getSettings()
  const t: Translator = (key, params) => mainT(settings.language, key, params)
  const silent = options.silent ?? false
  const currentVersion = app.getVersion()

  if (checking) {
    if (win && options.manual && !silent) {
      await notify(win, 'info', t('update.busyTitle'), t('update.busyDetail'), [t('update.ok')])
    }
    return {
      ...baseResult(currentVersion, 'github'),
      status: 'busy'
    }
  }

  checking = true
  try {
    const feed = feedUrl(settings.updateFeedUrl)
    if (feed && app.isPackaged && !isPortable()) {
      return await checkGenericFeed(feed, t, settings, { manual: options.manual, silent }, win)
    }
    return await checkGitHub(t, settings, { manual: options.manual, silent }, win)
  } finally {
    checking = false
  }
}

export async function initAutoUpdate(): Promise<void> {
  if (initialized) return
  initialized = true

  const settings = await getSettings()
  if (!settings.autoUpdate || !app.isPackaged) return

  const timer = setTimeout(() => {
    void checkForUpdates({ manual: false })
  }, AUTO_CHECK_DELAY_MS)
  timer.unref?.()
}
