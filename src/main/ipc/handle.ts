import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcContract } from '@shared/ipc/contract'

/**
 * 收口 ipcMain.handle 的注册，把通道名与请求/响应类型绑在一起，
 * 避免出现"改了 contract 忘了改 handler"的静默漂移。
 */
export function handle<K extends keyof IpcContract>(
  channel: K,
  fn: (
    req: IpcContract[K]['req'],
    event: IpcMainInvokeEvent
  ) => IpcContract[K]['res'] | Promise<IpcContract[K]['res']>
): void {
  ipcMain.handle(channel, (event, req: IpcContract[K]['req']) => fn(req, event))
}
