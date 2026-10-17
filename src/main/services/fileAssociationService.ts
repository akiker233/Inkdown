import { execFile } from 'node:child_process'
import { basename, join } from 'node:path'
import { app, shell } from 'electron'
import type { FileAssociationState } from '@shared/ipc/contract'
import { getSettings, patchSettings } from './settingsService'

/**
 * Windows 只允许用户本人确认默认应用，应用不能静默改写 UserChoice。
 * 这里的做法是：注册 ProgId / 打开方式 / Default Apps 能力项，
 * 再打开系统“默认应用”页面让用户完成最后一步确认。
 */
const EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mdx'] as const
const PROG_ID = 'Inkdown.Markdown'
const CAPABILITIES_KEY = 'HKCU\\Software\\Inkdown\\Capabilities'
const REGISTERED_APPS_KEY = 'HKCU\\Software\\RegisteredApplications'

const REG_EXE = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe')

interface RegResult {
  code: number
  stdout: string
  stderr: string
}

function runReg(args: string[]): Promise<RegResult> {
  return new Promise((resolve) => {
    execFile(REG_EXE, args, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? '')
      })
    })
  })
}

async function addValue(key: string, name: string | null, value: string): Promise<void> {
  const args = ['add', key, name === null ? '/ve' : '/v', ...(name === null ? [] : [name])]
  args.push('/t', 'REG_SZ', '/d', value, '/f')
  const result = await runReg(args)
  if (result.code !== 0) throw new Error(result.stderr.trim() || `注册表写入失败：${key}`)
}

async function deleteKey(key: string): Promise<void> {
  // 键不存在时 reg.exe 返回 1，这里视为成功
  await runReg(['delete', key, '/f'])
}

async function keyExists(key: string): Promise<boolean> {
  return (await runReg(['query', key])).code === 0
}

async function readValue(key: string, name: string): Promise<string | null> {
  const result = await runReg(['query', key, '/v', name])
  if (result.code !== 0) return null
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim().toLowerCase().startsWith(name.toLowerCase())) continue
    const match = line.match(/REG_(?:EXPAND_)?SZ\s+(.*)$/i)
    if (match) return match[1].trim()
  }
  return null
}

async function readDefault(key: string): Promise<string | null> {
  const result = await runReg(['query', key, '/ve'])
  if (result.code !== 0) return null
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/REG_(?:EXPAND_)?SZ\s+(.*)$/i)
    if (match) return match[1].trim()
  }
  return null
}

function supportReason(): FileAssociationState['reason'] {
  if (process.platform !== 'win32') return 'platform'
  if (!app.isPackaged) return 'dev'
  // 便携版每次运行会解压到不同临时目录，写进注册表的路径会失效
  if (process.env.PORTABLE_EXECUTABLE_FILE) return 'portable'
  return null
}

function executablePath(): string {
  return process.execPath
}

function markdownIconPath(): string {
  return join(process.resourcesPath, 'icon-md.ico')
}

function contextMenuKey(ext: string): string {
  return `HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\Inkdown`
}

async function contextMenuEnabled(): Promise<boolean> {
  return keyExists(contextMenuKey('.md'))
}

async function isRegistered(): Promise<boolean> {
  if (!(await keyExists(CAPABILITIES_KEY))) return false
  return (await readValue(REGISTERED_APPS_KEY, 'Inkdown')) === 'Software\\Inkdown\\Capabilities'
}

async function isDefaultApp(): Promise<boolean> {
  const userChoice = await readValue(
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md\\UserChoice',
    'ProgId'
  )
  if (userChoice) return userChoice === PROG_ID
  return (await readDefault('HKCU\\Software\\Classes\\.md')) === PROG_ID
}

async function contextMenuLabel(): Promise<string> {
  const { language } = await getSettings()
  return language === 'en' ? 'Open with Inkdown' : '使用 Inkdown 打开'
}

async function associationNeedsRefresh(): Promise<boolean> {
  const icon = await readDefault(`HKCU\\Software\\Classes\\${PROG_ID}\\DefaultIcon`)
  const command = await readDefault(`HKCU\\Software\\Classes\\${PROG_ID}\\shell\\open\\command`)
  return (
    icon !== `"${markdownIconPath()}",0` || command !== `"${executablePath()}" "%1"`
  )
}

async function applyContextMenu(enabled: boolean, label?: string): Promise<void> {
  const exe = executablePath()
  const command = `"${exe}" "%1"`
  const icon = `"${markdownIconPath()}",0`
  const text = label ?? (await contextMenuLabel())

  for (const ext of EXTENSIONS) {
    const key = contextMenuKey(ext)
    if (!enabled) {
      await deleteKey(key)
      continue
    }
    await addValue(key, null, text)
    await addValue(`${key}\\Icon`, null, icon)
    await addValue(`${key}\\command`, null, command)
  }
}

/** ProgId、打开方式名单与系统“默认应用”里可见的能力项 */
async function registerProgId(): Promise<void> {
  const exe = executablePath()
  const command = `"${exe}" "%1"`
  const appIcon = `"${exe}",0`
  const fileIcon = `"${markdownIconPath()}",0`
  const appKey = `HKCU\\Software\\Classes\\Applications\\${basename(exe)}`

  await addValue(`HKCU\\Software\\Classes\\${PROG_ID}`, null, 'Markdown Document')
  await addValue(`HKCU\\Software\\Classes\\${PROG_ID}\\DefaultIcon`, null, fileIcon)
  await addValue(`HKCU\\Software\\Classes\\${PROG_ID}\\shell\\open\\command`, null, command)

  await addValue(appKey, null, 'Inkdown')
  await addValue(`${appKey}\\FriendlyAppName`, null, 'Inkdown')
  await addValue(`${appKey}\\ApplicationIcon`, null, appIcon)
  await addValue(`${appKey}\\shell\\open\\command`, null, command)
  for (const ext of EXTENSIONS) {
    await addValue(`${appKey}\\SupportedTypes\\${ext}`, null, '')
    await addValue(`HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`, PROG_ID, '')
  }

  await addValue(CAPABILITIES_KEY, 'ApplicationName', 'Inkdown')
  await addValue(CAPABILITIES_KEY, 'ApplicationDescription', 'Inkdown Markdown Editor')
  await addValue(CAPABILITIES_KEY, 'ApplicationIcon', appIcon)
  for (const ext of EXTENSIONS) {
    await addValue(`${CAPABILITIES_KEY}\\FileAssociations\\${ext}`, null, PROG_ID)
  }
  await addValue(REGISTERED_APPS_KEY, 'Inkdown', 'Software\\Inkdown\\Capabilities')
}

export async function getFileAssociationState(): Promise<FileAssociationState> {
  const reason = supportReason()
  if (reason) {
    return {
      supported: false,
      reason,
      extensions: [...EXTENSIONS],
      contextMenu: false,
      registered: false,
      isDefault: false
    }
  }

  const [contextMenu, registered, isDefault] = await Promise.all([
    contextMenuEnabled(),
    isRegistered(),
    isDefaultApp()
  ])
  return {
    supported: true,
    reason: null,
    extensions: [...EXTENSIONS],
    contextMenu,
    registered,
    isDefault
  }
}

export async function setContextMenu(enabled: boolean): Promise<FileAssociationState> {
  if (supportReason()) throw new Error('当前版本不支持注册文件关联')
  await applyContextMenu(enabled)
  await patchSettings({ markdownContextMenu: enabled })
  return getFileAssociationState()
}

export async function openDefaultAppsSettings(): Promise<FileAssociationState> {
  if (supportReason()) throw new Error('当前版本不支持注册文件关联')
  await registerProgId()
  await shell.openExternal('ms-settings:defaultapps?registeredAppUser=Inkdown')
  return getFileAssociationState()
}

/** 启动时让注册表状态与设置一致；语言变化后也调用它刷新右键菜单文案 */
export async function syncFileAssociations(): Promise<void> {
  if (supportReason()) return
  const settings = await getSettings()
  const registered = await isRegistered()
  if (registered && (await associationNeedsRefresh())) {
    await registerProgId()
  }

  const current = await contextMenuEnabled()
  if (settings.markdownContextMenu) {
    await applyContextMenu(true)
  } else if (current) {
    await applyContextMenu(false)
  }
}
