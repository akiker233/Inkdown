import type { ExportFormat, ExportPayload } from '@shared/types/export'
import { activeTabOf, resolveDark, useEditorStore } from '../app/store/editorStore'
import { t } from '../i18n'
import { buildExportHtml } from './html'
import { markdownToLatex } from './latex'
import { renderMarkdown } from './markdown'

const FORMAT_LABEL: Record<ExportFormat, string> = {
  html: 'HTML',
  pdf: 'PDF',
  png: 'PNG',
  docx: 'Word (.docx)',
  latex: 'LaTeX',
  epub: 'EPUB'
}

const WARNINGS: Record<string, Parameters<typeof t>[0]> = {
  imageRemoteFailed: 'export.warnImageRemote',
  imageLocalFailed: 'export.warnImageLocal',
  pandocMissing: 'export.warnPandocMissing',
  pandocFailed: 'export.warnPandocFailed',
  pngScaled: 'export.warnPngScaled',
  pngTooTall: 'export.warnPngTooTall'
}

const running = new Set<string>()
let pandocNoticeShown = false

async function buildPayload(format: ExportFormat): Promise<ExportPayload | null> {
  const state = useEditorStore.getState()
  const tab = activeTabOf(state)
  if (!tab) return null

  const dark = resolveDark(state.theme, state.systemDark)
  const language = state.language
  const rendered = await renderMarkdown(tab.content, {
    docPath: tab.path,
    dark,
    titleFallback: tab.title.replace(/\.[^.]+$/, '')
  })

  return {
    format,
    path: '',
    title: rendered.title,
    docPath: tab.path,
    html: buildExportHtml(rendered, { dark, language }),
    markdown: tab.content,
    latex:
      format === 'latex'
        ? markdownToLatex(tab.content, {
            title: rendered.title,
            author: rendered.author,
            docPath: tab.path,
            language
          })
        : undefined,
    dark,
    toc: rendered.toc,
    language
  }
}

async function confirmWithoutPandoc(format: ExportFormat): Promise<boolean> {
  if (format !== 'docx' && format !== 'latex' && format !== 'epub') return true
  if (pandocNoticeShown) return true

  const capabilities = await window.api.export.capabilities()
  if (capabilities.pandoc) return true

  pandocNoticeShown = true
  const { response } = await window.api.dialog.message({
    type: 'info',
    message: t('export.pandocTitle'),
    detail: t('export.pandocDetail'),
    buttons: [t('export.continue'), t('export.cancelExport')]
  })
  return response === 0
}

function warningDetail(codes: string[]): string {
  const lines = codes
    .map((code) => WARNINGS[code])
    .filter((key): key is Parameters<typeof t>[0] => key !== undefined)
    .map((key) => t(key))
  return lines.join('\n')
}

export async function exportDocument(format: ExportFormat): Promise<void> {
  if (running.has(format)) return
  running.add(format)
  try {
    if (!activeTabOf(useEditorStore.getState())) {
      await window.api.dialog.message({
        type: 'info',
        message: t('export.noDocument'),
        buttons: [t('export.done')]
      })
      return
    }

    if (!(await confirmWithoutPandoc(format))) return

    const payload = await buildPayload(format)
    if (!payload) return

    const picked = await window.api.export.pickPath({
      format,
      docPath: payload.docPath,
      title: payload.title
    })
    if (!picked.path) return

    const result = await window.api.export.run({ ...payload, path: picked.path })
    const warning = warningDetail(result.warnings)
    const detail = [t('export.successDetail', { path: result.path }), warning]
      .filter(Boolean)
      .join('\n\n')

    const { response } = await window.api.dialog.message({
      type: 'info',
      message: t('export.successTitle'),
      detail,
      buttons: [t('export.showInFolder'), t('export.done')]
    })
    if (response === 0) await window.api.file.reveal(result.path)
  } catch (error) {
    await window.api.dialog.message({
      type: 'error',
      message: t('export.failed', { format: FORMAT_LABEL[format] }),
      detail: String(error),
      buttons: [t('export.done')]
    })
  } finally {
    running.delete(format)
  }
}

export async function printDocument(): Promise<void> {
  if (running.has('print')) return
  running.add('print')
  try {
    if (!activeTabOf(useEditorStore.getState())) return
    const payload = await buildPayload('pdf')
    if (!payload) return
    await window.api.export.print(payload)
  } catch (error) {
    await window.api.dialog.message({
      type: 'error',
      message: t('export.printFailed'),
      detail: String(error),
      buttons: [t('export.done')]
    })
  } finally {
    running.delete('print')
  }
}
