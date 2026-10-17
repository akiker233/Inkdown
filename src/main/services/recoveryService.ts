import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { RecoverySnapshot } from '@shared/types/workspace'

/**
 * 崩溃恢复快照。
 * 生命周期靠"正常退出时删除"来界定：进程被杀死 / 崩溃时 will-quit 不会执行，
 * 快照就留到下次启动被读到。
 */
function snapshotPath(): string {
  return join(app.getPath('userData'), 'recovery.json')
}

export async function saveRecovery(snapshot: RecoverySnapshot): Promise<void> {
  const target = snapshotPath()
  await fs.mkdir(dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify(snapshot), 'utf8')
}

export async function loadRecovery(): Promise<RecoverySnapshot | null> {
  try {
    const raw = await fs.readFile(snapshotPath(), 'utf8')
    const parsed = JSON.parse(raw) as RecoverySnapshot
    if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

export async function clearRecovery(): Promise<void> {
  await fs.rm(snapshotPath(), { force: true })
}
