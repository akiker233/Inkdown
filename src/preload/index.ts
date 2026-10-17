import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { InkdownApi } from '@shared/ipc/api'
import type { AppSettings, IpcContract } from '@shared/ipc/contract'
import type { Enc, Eol } from '@shared/types/document'
import type { IpcEvents } from '@shared/ipc/events'

type NoReq = Record<string, never>
const NONE: NoReq = {}

function invoke<K extends keyof IpcContract>(
  channel: K,
  req: IpcContract[K]['req']
): Promise<IpcContract[K]['res']> {
  return ipcRenderer.invoke(channel, req)
}

function subscribe<K extends keyof IpcEvents>(
  channel: K,
  cb: (payload: IpcEvents[K]) => void
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: IpcEvents[K]): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

/**
 * 白名单式暴露：只开放具名方法，绝不暴露通用 invoke(channel, ...)，
 * 否则 contextIsolation 就形同虚设。
 */
const api: InkdownApi = {
  file: {
    read: (path: string) => invoke('file:read', { path }),
    write: (path: string, content: string, eol?: Eol, encoding?: Enc) =>
      invoke('file:write', { path, content, eol, encoding }),
    create: (dir: string, name: string, kind: 'file' | 'dir') =>
      invoke('file:create', { dir, name, kind }),
    rename: (from: string, to: string) => invoke('file:rename', { from, to }),
    remove: (path: string) => invoke('file:delete', { path }),
    reveal: (path: string) => invoke('file:reveal', { path }),
    openExternal: (url: string) => invoke('file:openExternal', { url }),
    // File.path 在 Electron 32+ 已移除，必须走 webUtils
    pathForFile: (file: File) => webUtils.getPathForFile(file)
  },
  asset: {
    importImage: (opts) => invoke('asset:importImage', opts)
  },
  export: {
    pickPath: (opts) => invoke('export:pickPath', opts),
    capabilities: () => invoke('export:capabilities', NONE),
    run: (payload) => invoke('export:run', payload),
    print: (payload) => invoke('export:print', payload)
  },
  workspace: {
    scan: (root: string) => invoke('ws:scan', { root }),
    watch: (root: string) => invoke('ws:watch', { root }),
    unwatch: (watchId: string) => invoke('ws:unwatch', { watchId })
  },
  recovery: {
    save: (snapshot) => invoke('recovery:save', { snapshot }),
    load: () => invoke('recovery:load', NONE),
    clear: () => invoke('recovery:clear', NONE)
  },
  dialog: {
    openFile: (opts = {}) => invoke('dialog:openFile', opts),
    openFolder: (opts = {}) => invoke('dialog:openFolder', opts),
    saveFile: (opts = {}) => invoke('dialog:saveFile', opts),
    confirmClose: (fileName: string) => invoke('dialog:confirmClose', { fileName }),
    message: (opts) => invoke('dialog:message', opts)
  },
  app: {
    getInfo: () => invoke('app:getInfo', NONE),
    copyText: (text: string) => invoke('app:copyText', { text }),
    getSettings: () => invoke('app:getSettings', NONE),
    patchSettings: (patch: Partial<AppSettings>) => invoke('app:patchSettings', patch),
    setDirty: (dirty: boolean) => invoke('app:setDirty', { dirty }),
    setOpenPaths: (paths: string[]) => invoke('app:setOpenPaths', { paths }),
    consumeLaunchTargets: () => invoke('app:consumeLaunchTargets', NONE),
    getMenu: () => invoke('app:getMenu', NONE),
    syncMenuViewState: (state) => invoke('app:syncMenuViewState', state),
    editAction: (action) => invoke('app:editAction', { action }),
    zoom: (direction) => invoke('app:zoom', { direction }),
    checkUpdates: (options) => invoke('app:checkUpdates', options ?? {})
  },
  fileAssoc: {
    get: () => invoke('fileAssoc:get', NONE),
    setContextMenu: (enabled: boolean) => invoke('fileAssoc:setContextMenu', { enabled }),
    openDefaultApps: () => invoke('fileAssoc:openDefaultApps', NONE)
  },
  window: {
    minimize: () => invoke('window:minimize', NONE),
    toggleMaximize: () => invoke('window:toggleMaximize', NONE),
    close: () => invoke('window:close', NONE),
    toggleFullScreen: () => invoke('window:toggleFullScreen', NONE),
    forceClose: () => invoke('window:forceClose', NONE),
    getState: () => invoke('window:getState', NONE)
  },
  on: subscribe
}

contextBridge.exposeInMainWorld('api', api)
