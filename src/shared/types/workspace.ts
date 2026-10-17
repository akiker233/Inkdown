export interface TreeNode {
  name: string
  path: string
  kind: 'file' | 'dir'
  children?: TreeNode[]
  mtimeMs?: number
}

export type FsChangeKind = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

export interface FsChange {
  path: string
  kind: FsChangeKind
}

export interface RecoveryEntry {
  /** 标签 id，恢复时用它接回原来的标签 */
  docId: string
  path: string | null
  title: string
  content: string
  savedAt: number
}

export interface RecoverySnapshot {
  savedAt: number
  entries: RecoveryEntry[]
}
