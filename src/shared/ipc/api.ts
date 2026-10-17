import type { AppSettings, IpcContract } from './contract'
import type { IpcEvents } from './events'
import type { Enc, Eol } from '../types/document'
import type { ExportPayload } from '../types/export'
import type { RecoverySnapshot, TreeNode } from '../types/workspace'
import type { UpdateCheckResult } from '../types/update'
import type { AppMenuViewState } from '../types/menu'

type Req<K extends keyof IpcContract> = IpcContract[K]['req']
type Res<K extends keyof IpcContract> = IpcContract[K]['res']

/**
 * 渲染进程可见的 API 表面（即 window.api）。
 * 定义在 shared 里，preload 负责实现、renderer 负责消费，
 * 这样 renderer 无需引用 preload 源码即可获得完整类型。
 */
export interface InkdownApi {
  file: {
    read: (path: string) => Promise<Res<'file:read'>>
    write: (path: string, content: string, eol?: Eol, encoding?: Enc) => Promise<Res<'file:write'>>
    create: (dir: string, name: string, kind: 'file' | 'dir') => Promise<Res<'file:create'>>
    rename: (from: string, to: string) => Promise<Res<'file:rename'>>
    /** 移入回收站，不做永久删除 */
    remove: (path: string) => Promise<void>
    reveal: (path: string) => Promise<void>
    openExternal: (url: string) => Promise<void>
    /** 仅 Electron 可用：拖拽 / 粘贴的 File 通过 webUtils 取真实磁盘路径 */
    pathForFile: (file: File) => string
  }
  asset: {
    importImage: (opts: Req<'asset:importImage'>) => Promise<Res<'asset:importImage'>>
  }
  export: {
    pickPath: (opts: Req<'export:pickPath'>) => Promise<Res<'export:pickPath'>>
    capabilities: () => Promise<Res<'export:capabilities'>>
    run: (payload: ExportPayload) => Promise<Res<'export:run'>>
    print: (payload: ExportPayload) => Promise<Res<'export:print'>>
  }
  workspace: {
    scan: (root: string) => Promise<TreeNode>
    watch: (root: string) => Promise<Res<'ws:watch'>>
    unwatch: (watchId: string) => Promise<void>
  }
  recovery: {
    save: (snapshot: RecoverySnapshot) => Promise<void>
    load: () => Promise<RecoverySnapshot | null>
    clear: () => Promise<void>
  }
  dialog: {
    openFile: (opts?: Req<'dialog:openFile'>) => Promise<Res<'dialog:openFile'>>
    openFolder: (opts?: Req<'dialog:openFolder'>) => Promise<Res<'dialog:openFolder'>>
    saveFile: (opts?: Req<'dialog:saveFile'>) => Promise<Res<'dialog:saveFile'>>
    confirmClose: (fileName: string) => Promise<Res<'dialog:confirmClose'>>
    message: (opts: Req<'dialog:message'>) => Promise<Res<'dialog:message'>>
  }
  app: {
    getInfo: () => Promise<Res<'app:getInfo'>>
    copyText: (text: string) => Promise<void>
    getSettings: () => Promise<AppSettings>
    patchSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
    /** 同步未保存状态给主进程，供关闭窗口时拦截使用 */
    setDirty: (dirty: boolean) => Promise<void>
    setOpenPaths: (paths: string[]) => Promise<void>
    consumeLaunchTargets: () => Promise<Res<'app:consumeLaunchTargets'>>
    getMenu: () => Promise<Res<'app:getMenu'>>
    syncMenuViewState: (state: Partial<AppMenuViewState>) => Promise<void>
    editAction: (action: Req<'app:editAction'>['action']) => Promise<void>
    zoom: (direction: Req<'app:zoom'>['direction']) => Promise<number>
    /** silent 为 true 时只返回结果，不弹出原生对话框 */
    checkUpdates: (options?: Req<'app:checkUpdates'>) => Promise<UpdateCheckResult>
  }
  fileAssoc: {
    get: () => Promise<Res<'fileAssoc:get'>>
    setContextMenu: (enabled: boolean) => Promise<Res<'fileAssoc:setContextMenu'>>
    openDefaultApps: () => Promise<Res<'fileAssoc:openDefaultApps'>>
  }
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
    toggleFullScreen: () => Promise<void>
    /** 跳过未保存拦截，直接关闭 */
    forceClose: () => Promise<void>
    getState: () => Promise<Res<'window:getState'>>
  }
  on: <K extends keyof IpcEvents>(channel: K, cb: (payload: IpcEvents[K]) => void) => () => void
}
