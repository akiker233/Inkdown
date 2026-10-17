import type { IpcContract } from './contract'

/**
 * IPC 通道名唯一真源。任何地方都不得硬编码通道字符串。
 * `satisfies` 保证这里的名字与 contract.ts 声明保持一致，改漏了会编译报错。
 */
export const CH = {
  // ── 文件 ──
  fileRead: 'file:read',
  fileWrite: 'file:write',
  fileCreate: 'file:create',
  fileRename: 'file:rename',
  fileDelete: 'file:delete',
  fileReveal: 'file:reveal',
  fileOpenExternal: 'file:openExternal',

  // ── 资源 ──
  assetImportImage: 'asset:importImage',

  // ── 导出 ──
  exportPickPath: 'export:pickPath',
  exportCapabilities: 'export:capabilities',
  exportRun: 'export:run',
  exportPrint: 'export:print',

  // ── 工作区 ──
  wsScan: 'ws:scan',
  wsWatch: 'ws:watch',
  wsUnwatch: 'ws:unwatch',

  // ── 对话框 ──
  dialogOpenFile: 'dialog:openFile',
  dialogOpenFolder: 'dialog:openFolder',
  dialogSaveFile: 'dialog:saveFile',
  dialogConfirmClose: 'dialog:confirmClose',
  dialogMessage: 'dialog:message',

  // ── 崩溃恢复 ──
  recoverySave: 'recovery:save',
  recoveryLoad: 'recovery:load',
  recoveryClear: 'recovery:clear',

  // ── 应用 / 窗口 ──
  appGetInfo: 'app:getInfo',
  appCopyText: 'app:copyText',
  appGetSettings: 'app:getSettings',
  appPatchSettings: 'app:patchSettings',
  appSetDirty: 'app:setDirty',
  appSetOpenPaths: 'app:setOpenPaths',
  appConsumeLaunchTargets: 'app:consumeLaunchTargets',
  appGetMenu: 'app:getMenu',
  appSyncMenuViewState: 'app:syncMenuViewState',
  appEditAction: 'app:editAction',
  appZoom: 'app:zoom',
  appCheckUpdates: 'app:checkUpdates',

  // ── 文件关联 ──
  fileAssocGet: 'fileAssoc:get',
  fileAssocSetContextMenu: 'fileAssoc:setContextMenu',
  fileAssocOpenDefaultApps: 'fileAssoc:openDefaultApps',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggleMaximize',
  windowClose: 'window:close',
  windowToggleFullScreen: 'window:toggleFullScreen',
  windowForceClose: 'window:forceClose',
  windowGetState: 'window:getState',

  // ── 主 → 渲染推送 ──
  eventWindowState: 'event:window-state',
  eventMenuCommand: 'event:menu-command',
  eventThemeSystem: 'event:theme-system',
  eventOpenFiles: 'event:open-files',
  eventOpenFolder: 'event:open-folder',
  eventCloseRequest: 'event:close-request',
  eventFsChanged: 'event:fs-changed',
  eventFileConflict: 'event:file-conflict'
} as const satisfies Record<string, keyof IpcContract | `event:${string}`>

export type IpcChannel = keyof IpcContract
