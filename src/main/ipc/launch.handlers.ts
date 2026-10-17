import { CH } from '@shared/ipc/channels'
import { handle } from './handle'

interface LaunchTargets {
  files: string[]
  folder: string | null
}

let pending: LaunchTargets = { files: [], folder: null }

/** 冷启动的路径先排队，等渲染进程就绪后主动拉取 */
export function queueLaunchTargets(targets: LaunchTargets): void {
  pending = {
    files: [...pending.files, ...targets.files],
    folder: targets.folder ?? pending.folder
  }
}

export function registerLaunchHandlers(): void {
  handle(CH.appConsumeLaunchTargets, () => {
    const targets = pending
    pending = { files: [], folder: null }
    return targets
  })
}
