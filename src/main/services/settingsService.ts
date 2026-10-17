import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { AppLanguage, AppSettings } from '@shared/ipc/contract'

const BASE_DEFAULTS: Omit<AppSettings, 'language'> = {
  theme: 'system',
  spellcheck: true,
  fontSize: 16,
  lastDir: null,
  workspaceRoot: null,
  recentFiles: [],
  autoSave: true,
  autoSaveDelay: 800,
  sidebarVisible: true,
  menuBarVisible: true,
  formatToolbarVisible: true,
  autoUpdate: false,
  dismissedUpdateVersion: null,
  updateFeedUrl: null,
  markdownContextMenu: false
}

/** 首次启动跟随系统语言；拿不到 locale 时按中文处理 */
function detectLanguage(): AppLanguage {
  try {
    return app.getLocale().toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'zh'
  }
}

const RECENT_LIMIT = 24

let cache: AppSettings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function getSettings(): Promise<AppSettings> {
  if (cache) return cache
  const defaults: AppSettings = { ...BASE_DEFAULTS, language: detectLanguage() }
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    cache = { ...defaults, ...parsed }
  } catch {
    cache = defaults
  }
  return cache
}

export async function patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next: AppSettings = { ...(await getSettings()), ...patch }
  if (patch.recentFiles) {
    next.recentFiles = [...new Set(patch.recentFiles)].slice(0, RECENT_LIMIT)
  }
  cache = next
  const target = settingsPath()
  await fs.mkdir(dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify(next, null, 2), 'utf8')
  return next
}
