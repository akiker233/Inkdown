import { CH } from '@shared/ipc/channels'
import { clearRecovery, loadRecovery, saveRecovery } from '../services/recoveryService'
import { handle } from './handle'

export function registerRecoveryHandlers(): void {
  handle(CH.recoverySave, (req) => saveRecovery(req.snapshot))
  handle(CH.recoveryLoad, () => loadRecovery())
  handle(CH.recoveryClear, () => clearRecovery())
}
