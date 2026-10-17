import { promises as fs } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type { FsChange, TreeNode } from '@shared/types/workspace'

/** 这些目录不参与扫描与监听：体积大且几乎不会是作者的 Markdown 笔记 */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'out',
  'release',
  '.idea',
  '__pycache__',
  '.cache'
])

const MAX_DEPTH = 12

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

export async function scanWorkspace(root: string, depth = MAX_DEPTH): Promise<TreeNode> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const children: TreeNode[] = []

  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      const node: TreeNode = { name: entry.name, path: full, kind: 'dir' }
      if (depth > 0) {
        try {
          node.children = (await scanWorkspace(full, depth - 1)).children
        } catch {
          node.children = []
        }
      }
      children.push(node)
    } else if (entry.isFile()) {
      children.push({ name: entry.name, path: full, kind: 'file' })
    }
  }

  children.sort(compareNodes)
  return { name: basename(resolve(root)), path: resolve(root), kind: 'dir', children }
}

function isIgnoredPath(target: string): boolean {
  return target.split(/[\\/]/).some((segment) => IGNORED_DIRS.has(segment))
}

interface WatchEntry {
  watcher: FSWatcher
  root: string
}

const watchers = new Map<string, WatchEntry>()
let seq = 0

/**
 * 监听一个工作区。事件按 120ms 合并后成批下发，避免一次批量操作刷出上百条 IPC。
 * 返回的 watchId 用于 ws:unwatch。
 */
export function watchWorkspace(root: string, onChange: (changes: FsChange[]) => void): string {
  const watchId = `watch-${++seq}`
  const pending = new Map<string, FsChange>()
  let timer: NodeJS.Timeout | null = null

  const flush = (): void => {
    timer = null
    if (pending.size === 0) return
    const changes = [...pending.values()]
    pending.clear()
    onChange(changes)
  }

  const watcher = watch(root, {
    ignoreInitial: true,
    depth: MAX_DEPTH,
    ignored: (target: string) => isIgnoredPath(target),
    // 等写入稳定再报 change，否则外部编辑器的"先清空再写入"会读到空文件
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  })

  watcher.on('all', (event, target) => {
    if (event !== 'add' && event !== 'change' && event !== 'unlink' && event !== 'addDir' && event !== 'unlinkDir') {
      return
    }
    pending.set(target, { path: target, kind: event })
    if (!timer) timer = setTimeout(flush, 120)
  })

  watchers.set(watchId, { watcher, root: resolve(root) })
  return watchId
}

export async function unwatchWorkspace(watchId: string): Promise<void> {
  const entry = watchers.get(watchId)
  if (!entry) return
  watchers.delete(watchId)
  await entry.watcher.close()
}

export async function closeAllWatchers(): Promise<void> {
  const entries = [...watchers.values()]
  watchers.clear()
  await Promise.all(entries.map((entry) => entry.watcher.close()))
}

export function workspaceRootOf(watchId: string): string | null {
  return watchers.get(watchId)?.root ?? null
}
