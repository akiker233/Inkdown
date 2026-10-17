import type { CloseConfirm, Enc, Eol, FileReadResult, FileWriteResult } from '../types/document'
import type { AppMenuItem } from '../types/menu'
import type { ExportCapabilities, ExportFormat, ExportPayload, ExportResult } from '../types/export'
import type { RecoverySnapshot, TreeNode } from '../types/workspace'

/**
 * IPC 唯一契约真源。
 * 新增通道必须同时在此声明，channels.ts 会用 `satisfies` 校验命名一致。
 */
export type IpcContract = {
  // ── 文件 ──
  'file:read': { req: { path: string }; res: FileReadResult }
  'file:write': { req: { path: string; content: string; encoding?: Enc; eol?: Eol }; res: FileWriteResult }
  'file:create': { req: { dir: string; name: string; kind: 'file' | 'dir' }; res: { path: string } }
  'file:rename': { req: { from: string; to: string }; res: { path: string } }
  'file:delete': { req: { path: string }; res: void }
  'file:reveal': { req: { path: string }; res: void }
  'file:openExternal': { req: { url: string }; res: void }

  // ── 资源 ──
  /** 把图片复制 / 写入文档旁的 assets/，返回可直接插入的 Markdown */
  'asset:importImage': {
    req: {
      docPath: string
      sourcePath?: string
      data?: Uint8Array
      ext?: string
      alt?: string
    }
    res: { path: string; relative: string; markdown: string }
  }

  // ── 导出 ──
  'export:pickPath': {
    req: { format: ExportFormat; docPath: string | null; title: string }
    res: { path: string | null }
  }
  'export:capabilities': { req: Record<string, never>; res: ExportCapabilities }
  'export:run': { req: ExportPayload; res: ExportResult }
  'export:print': { req: ExportPayload; res: { printed: boolean } }

  // ── 工作区 ──
  'ws:scan': { req: { root: string }; res: TreeNode }
  'ws:watch': { req: { root: string }; res: { watchId: string } }
  'ws:unwatch': { req: { watchId: string }; res: void }

  // ── 对话框 ──
  'dialog:openFile': {
    req: { multiple?: boolean; defaultPath?: string; kind?: 'markdown' | 'image' }
    res: { paths: string[] }
  }
  'dialog:openFolder': { req: { defaultPath?: string }; res: { path: string | null } }
  'dialog:saveFile': { req: { defaultPath?: string }; res: { path: string | null } }
  'dialog:confirmClose': { req: { fileName: string }; res: { choice: CloseConfirm } }
  'dialog:message': {
    req: { type: 'info' | 'warning' | 'error' | 'question'; message: string; detail?: string; buttons: string[] }
    res: { response: number }
  }

  // ── 崩溃恢复 ──
  'recovery:save': { req: { snapshot: RecoverySnapshot }; res: void }
  'recovery:load': { req: Record<string, never>; res: RecoverySnapshot | null }
  'recovery:clear': { req: Record<string, never>; res: void }

  // ── 应用 / 窗口 ──
  'app:getInfo': { req: Record<string, never>; res: AppInfo }
  'app:copyText': { req: { text: string }; res: void }
  'app:getSettings': { req: Record<string, never>; res: AppSettings }
  'app:patchSettings': { req: Partial<AppSettings>; res: AppSettings }
  /** dirty = 是否有任一标签未保存，供窗口关闭拦截使用 */
  'app:setDirty': { req: { dirty: boolean }; res: void }
  /** 当前打开的文档路径，主进程据此判断磁盘上的文件是否与打开中的文档冲突 */
  'app:setOpenPaths': { req: { paths: string[] }; res: void }
  /** 冷启动由文件关联带入的路径；渲染进程就绪后主动拉取，避免事件早于订阅丢失 */
  'app:consumeLaunchTargets': {
    req: Record<string, never>
    res: { files: string[]; folder: string | null }
  }
  /** 自绘菜单栏直接复用原生菜单模板，保证入口完全一致 */
  'app:getMenu': { req: Record<string, never>; res: AppMenuItem[] }
  /** 剪切/复制/粘贴需要主进程的 webContents 能力 */
  'app:editAction': { req: { action: 'cut' | 'copy' | 'paste' }; res: void }
  'app:zoom': { req: { direction: 'in' | 'out' | 'reset' }; res: number }
  'app:checkUpdates': { req: Record<string, never>; res: void }

  // ── 文件关联 ──
  'fileAssoc:get': { req: Record<string, never>; res: FileAssociationState }
  'fileAssoc:setContextMenu': { req: { enabled: boolean }; res: FileAssociationState }
  /** 注册为系统可见的 Markdown 应用，并打开 Windows 默认应用设置 */
  'fileAssoc:openDefaultApps': { req: Record<string, never>; res: FileAssociationState }
  'window:minimize': { req: Record<string, never>; res: void }
  'window:toggleMaximize': { req: Record<string, never>; res: void }
  'window:close': { req: Record<string, never>; res: void }
  'window:toggleFullScreen': { req: Record<string, never>; res: void }
  'window:forceClose': { req: Record<string, never>; res: void }
  'window:getState': { req: Record<string, never>; res: WindowState }
}

export interface WindowState {
  maximized: boolean
  fullScreen: boolean
  platform: NodeJS.Platform
}

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
  locale: string
  userDataPath: string
}

export type ThemeMode = 'system' | 'light' | 'dark'

export type AppLanguage = 'zh' | 'en'

export interface FileAssociationState {
  /** 只有 Windows 安装版可写注册表 */
  supported: boolean
  reason: 'platform' | 'dev' | 'portable' | null
  extensions: string[]
  /** 是否显示“使用 Inkdown 打开”右键菜单 */
  contextMenu: boolean
  /** 是否已在系统“默认应用”中注册 */
  registered: boolean
  /** 当前 .md 的默认应用是否已是 Inkdown（最终确认只能由用户在系统设置里完成） */
  isDefault: boolean
}

export interface AppSettings {
  theme: ThemeMode
  language: AppLanguage
  /** 编辑器原生拼写检查（Electron contenteditable） */
  spellcheck: boolean
  fontSize: number
  /** 上次打开的目录，用于 Ctrl+O 的默认路径 */
  lastDir: string | null
  workspaceRoot: string | null
  /** 最近打开的文档，最新的在前 */
  recentFiles: string[]
  autoSave: boolean
  /** 停止输入多久后自动保存（毫秒） */
  autoSaveDelay: number
  sidebarVisible: boolean
  /** 自动更新默认关闭；开启后需同时配置 updateFeedUrl 或 INKDOWN_UPDATE_URL */
  autoUpdate: boolean
  /** generic 更新源地址（latest.yml 所在目录） */
  updateFeedUrl: string | null
  /** 是否在 Markdown 文件右键菜单显示“使用 Inkdown 打开” */
  markdownContextMenu: boolean
}

export type { FsChange, RecoveryEntry, RecoverySnapshot, TreeNode } from '../types/workspace'
