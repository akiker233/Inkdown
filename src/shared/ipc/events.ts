import type { MenuCommandId } from '../types/menu'
import type { FsChange } from '../types/workspace'

/** 主进程 → 渲染进程的单向推送事件 */
export interface IpcEvents {
  'event:window-state': { maximized: boolean; fullScreen: boolean }
  'event:menu-command': { command: MenuCommandId }
  'event:theme-system': { dark: boolean }
  'event:open-files': { paths: string[] }
  'event:open-folder': { path: string }
  /** 主进程拦截了窗口关闭，要求渲染进程确认未保存的更改 */
  'event:close-request': Record<string, never>
  /** 工作区内文件变化（已按批合并） */
  'event:fs-changed': { watchId: string; changes: FsChange[] }
  /** 某个已打开的文档在磁盘上被外部修改或删除 */
  'event:file-conflict': { path: string; mtimeMs: number; deleted: boolean }
}
