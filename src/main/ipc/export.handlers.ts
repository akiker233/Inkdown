import { CH } from '@shared/ipc/channels'
import { pickExportPath, printExport, probePandoc, runExport } from '../services/exportService'
import { handle } from './handle'

export function registerExportHandlers(): void {
  handle(CH.exportPickPath, (req) => pickExportPath(req))
  handle(CH.exportCapabilities, () => probePandoc())
  handle(CH.exportRun, (payload) => runExport(payload))
  handle(CH.exportPrint, (payload) => printExport(payload))
}
