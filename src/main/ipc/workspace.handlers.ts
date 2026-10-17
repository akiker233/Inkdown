import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import { CH } from '@shared/ipc/channels'
import type { FsChange } from '@shared/types/workspace'
import { wasWrittenByUs } from '../services/fileService'
import { scanWorkspace, unwatchWorkspace, watchWorkspace } from '../services/workspaceService'
import { getMainWindow } from '../window/mainWindow'
import { handle } from './handle'

/** 当前打开的文档路径（规范化为小写，Windows 大小写不敏感） */
const openPaths = new Set<string>()

function pathKey(target: string): string {
  const absolute = resolve(target)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

function reportChanges(watchId: string, changes: FsChange[]): void {
  const win = getMainWindow()
  if (!win) return
  win.webContents.send(CH.eventFsChanged, { watchId, changes })

  for (const change of changes) {
    if (change.kind !== 'change' && change.kind !== 'unlink') continue
    if (!openPaths.has(pathKey(change.path))) continue
    if (change.kind === 'change' && wasWrittenByUs(change.path)) continue

    void (async () => {
      let mtimeMs = 0
      let deleted = change.kind === 'unlink'
      try {
        mtimeMs = (await fs.stat(change.path)).mtimeMs
      } catch {
        deleted = true
      }
      getMainWindow()?.webContents.send(CH.eventFileConflict, {
        path: change.path,
        mtimeMs,
        deleted
      })
    })()
  }
}

export function registerWorkspaceHandlers(): void {
  handle(CH.wsScan, (req) => scanWorkspace(req.root))

  handle(CH.wsWatch, (req) => {
    const watchId = watchWorkspace(req.root, (changes) => reportChanges(watchId, changes))
    return { watchId }
  })

  handle(CH.wsUnwatch, (req) => unwatchWorkspace(req.watchId))

  handle(CH.appSetOpenPaths, (req) => {
    openPaths.clear()
    for (const path of req.paths) openPaths.add(pathKey(path))
  })
}
