import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { t } from '../../i18n'
import { docPathField } from './docPath'

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i
const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif'
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name)
}

function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return []
  const fromFiles = Array.from(data.files ?? []).filter(isImageFile)
  if (fromFiles.length > 0) return fromFiles

  // 截图粘贴常常只有 items，没有 files
  const fromItems: File[] = []
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) fromItems.push(file)
  }
  return fromItems
}

function baseName(name: string): string {
  const normalized = name.replace(/\\/g, '/')
  const base = normalized.slice(normalized.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

function extensionOf(file: File): string {
  const byMime = EXT_BY_MIME[file.type]
  if (byMime) return byMime
  const match = IMAGE_EXT_RE.exec(file.name)
  return match ? `.${match[1].toLowerCase()}` : '.png'
}

let warnedUntitled = false

async function report(message: string, detail: string): Promise<void> {
  await window.api.dialog.message({ type: 'error', message, detail, buttons: [t('store.gotIt')] })
}

async function warnSaveFirst(): Promise<void> {
  if (warnedUntitled) return
  warnedUntitled = true
  await window.api.dialog.message({
    type: 'info',
    message: t('drop.saveFirst'),
    detail: t('drop.saveFirstDetail'),
    buttons: [t('store.gotIt')]
  })
}

function insertMarkdown(view: EditorView, at: number, markdown: string): void {
  if (!markdown) return
  const position = Math.min(at, view.state.doc.length)
  view.dispatch({
    changes: { from: position, insert: markdown },
    selection: { anchor: position + markdown.length }
  })
  view.focus()
}

async function importImages(files: readonly File[], view: EditorView, at: number): Promise<void> {
  const docPath = view.state.field(docPathField, false) ?? ''
  if (!docPath) {
    await warnSaveFirst()
    return
  }

  let markdown = ''
  for (const file of files) {
    try {
      let sourcePath = ''
      try {
        sourcePath = window.api.file.pathForFile(file)
      } catch {
        // 截图等内存里的 File 没有磁盘路径，走 data 分支
      }

      const alt = baseName(file.name) || 'image'
      const result = sourcePath
        ? await window.api.asset.importImage({ docPath, sourcePath, alt })
        : await window.api.asset.importImage({
            docPath,
            data: new Uint8Array(await file.arrayBuffer()),
            ext: extensionOf(file),
            alt
          })

      markdown += `${markdown ? '\n' : ''}${result.markdown}`
    } catch (error) {
      await report(t('drop.insertImageFailed'), `${file.name}\n${String(error)}`)
    }
  }

  insertMarkdown(view, at, markdown)
}

/** 菜单「插入图片」用磁盘路径走这里，与拖拽粘贴共用同一套复制逻辑 */
export async function insertImagePaths(
  paths: readonly string[],
  view: EditorView,
  at: number
): Promise<void> {
  const docPath = view.state.field(docPathField, false) ?? ''
  if (!docPath) {
    await warnSaveFirst()
    return
  }

  let markdown = ''
  for (const path of paths) {
    try {
      const result = await window.api.asset.importImage({
        docPath,
        sourcePath: path,
        alt: baseName(path) || 'image'
      })
      markdown += `${markdown ? '\n' : ''}${result.markdown}`
    } catch (error) {
      await report(t('drop.insertImageFailed'), `${path}\n${String(error)}`)
    }
  }

  insertMarkdown(view, at, markdown)
}

/**
 * 粘贴 / 拖拽图片时复制到文档旁的 assets/ 目录，并在光标处写入 Markdown 引用。
 * 只拦截图片；普通文本与文件拖拽保持 CodeMirror 的默认行为。
 */
export function imageDropPaste(): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = imageFiles(event.clipboardData)
      if (files.length === 0) return false
      event.preventDefault()
      void importImages(files, view, view.state.selection.main.from)
      return true
    },

    drop(event, view) {
      const files = imageFiles(event.dataTransfer)
      if (files.length === 0) return false
      event.preventDefault()
      const at =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
        view.state.selection.main.from
      void importImages(files, view, at)
      return true
    }
  })
}
