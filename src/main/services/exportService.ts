import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { BrowserWindow, dialog, net } from 'electron'
import JSZip from 'jszip'
import type {
  ExportCapabilities,
  ExportFormat,
  ExportPayload,
  ExportResult
} from '@shared/types/export'
import { mainT } from '../i18n'
import { getMainWindow } from '../window/mainWindow'
import { getSettings, patchSettings } from './settingsService'

const execFileAsync = promisify(execFile)

interface FormatInfo {
  ext: string
  filterKey: 'export.filterHtml' | 'export.filterPdf' | 'export.filterPng' | 'export.filterDocx' | 'export.filterLatex' | 'export.filterEpub'
  titleKey: 'export.html' | 'export.pdf' | 'export.png' | 'export.docx' | 'export.latex' | 'export.epub'
}

const FORMATS: Record<ExportFormat, FormatInfo> = {
  html: { ext: 'html', filterKey: 'export.filterHtml', titleKey: 'export.html' },
  pdf: { ext: 'pdf', filterKey: 'export.filterPdf', titleKey: 'export.pdf' },
  png: { ext: 'png', filterKey: 'export.filterPng', titleKey: 'export.png' },
  docx: { ext: 'docx', filterKey: 'export.filterDocx', titleKey: 'export.docx' },
  latex: { ext: 'tex', filterKey: 'export.filterLatex', titleKey: 'export.latex' },
  epub: { ext: 'epub', filterKey: 'export.filterEpub', titleKey: 'export.epub' }
}

const MAX_INLINE_IMAGE = 40 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon'
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'document'
}

function suggestedPath(
  format: ExportFormat,
  docPath: string | null,
  title: string,
  lastDir: string | null
): string {
  const info = FORMATS[format]
  if (docPath) {
    const base = basename(docPath, extname(docPath))
    return join(dirname(docPath), `${base}.${info.ext}`)
  }
  const dir = lastDir ?? tmpdir()
  return join(dir, `${sanitizeFileName(title)}.${info.ext}`)
}

export async function pickExportPath(req: {
  format: ExportFormat
  docPath: string | null
  title: string
}): Promise<{ path: string | null }> {
  const settings = await getSettings()
  const info = FORMATS[req.format]
  const win = getMainWindow()
  const options: Electron.SaveDialogOptions = {
    title: mainT(settings.language, 'export.saveTitle', {
      format: mainT(settings.language, info.titleKey)
    }),
    defaultPath: suggestedPath(req.format, req.docPath, req.title, settings.lastDir),
    filters: [{ name: mainT(settings.language, info.filterKey), extensions: [info.ext] }]
  }
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return { path: null }

  let path = result.filePath
  if (!extname(path)) path = `${path}.${info.ext}`
  await patchSettings({ lastDir: dirname(path) })
  return { path }
}

let pandocCache: { at: number; value: ExportCapabilities } | null = null

export async function probePandoc(): Promise<ExportCapabilities> {
  const now = Date.now()
  if (pandocCache && now - pandocCache.at < 30_000) return pandocCache.value

  let value: ExportCapabilities = { pandoc: false, pandocVersion: null }
  try {
    const { stdout } = await execFileAsync('pandoc', ['--version'], {
      timeout: 5000,
      windowsHide: true
    })
    const version = /pandoc(?:\.exe)?\s+([\d.]+)/i.exec(stdout)?.[1] ?? null
    value = { pandoc: true, pandocVersion: version }
  } catch {
    value = { pandoc: false, pandocVersion: null }
  }
  pandocCache = { at: now, value }
  return value
}

function mimeForPath(path: string): string {
  const ext = extname(path).slice(1).toLowerCase()
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

function decodeAssetUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'local') return null
    let pathname = decodeURIComponent(parsed.pathname)
    if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1)
    return pathname.replace(/\//g, process.platform === 'win32' ? '\\' : '/')
  } catch {
    return null
  }
}

async function readImageAsDataUrl(src: string, docPath: string | null): Promise<{ url: string } | { error: 'remote' | 'local' }> {
  let localPath: string | null = null

  if (src.startsWith('inkdown-asset://')) {
    localPath = decodeAssetUrl(src)
  } else if (src.startsWith('file://')) {
    try {
      localPath = fileURLToPath(src)
    } catch {
      localPath = null
    }
  } else if (/^https?:/i.test(src)) {
    try {
      const response = await net.fetch(src, { signal: AbortSignal.timeout(15_000) })
      if (!response.ok) return { error: 'remote' }
      const contentType = response.headers.get('content-type') ?? 'image/png'
      if (!contentType.startsWith('image/')) return { error: 'remote' }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength > MAX_INLINE_IMAGE) return { error: 'remote' }
      return { url: `data:${contentType};base64,${buffer.toString('base64')}` }
    } catch {
      return { error: 'remote' }
    }
  } else if (!/^(?:data:|blob:)/i.test(src) && docPath) {
    localPath = resolve(dirname(docPath), src.replace(/\//g, process.platform === 'win32' ? '\\' : '/'))
  }

  if (!localPath) return { error: 'local' }
  try {
    const [buffer, stat] = await Promise.all([fs.readFile(localPath), fs.stat(localPath)])
    if (!stat.isFile() || stat.size > MAX_INLINE_IMAGE) return { error: 'local' }
    return { url: `data:${mimeForPath(localPath)};base64,${buffer.toString('base64')}` }
  } catch {
    return { error: 'local' }
  }
}

async function inlineImages(
  html: string,
  docPath: string | null,
  warnings: string[]
): Promise<string> {
  const tags = html.match(/<img\b[^>]*>/gi) ?? []
  const cache = new Map<string, string | null>()
  let remoteFailed = false
  let localFailed = false

  for (const tag of tags) {
    const match = /\bsrc=(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    const src = match?.[1] ?? match?.[2]
    if (!src || cache.has(src)) continue
    if (/^data:/i.test(src)) {
      cache.set(src, src)
      continue
    }
    const result = await readImageAsDataUrl(src, docPath)
    if ('url' in result) {
      cache.set(src, result.url)
    } else {
      cache.set(src, null)
      if (result.error === 'remote') remoteFailed = true
      else localFailed = true
    }
  }

  if (remoteFailed) warnings.push('imageRemoteFailed')
  if (localFailed) warnings.push('imageLocalFailed')

  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const match = /\bsrc=(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    const src = match?.[1] ?? match?.[2]
    if (!src) return tag
    const data = cache.get(src)
    if (!data) return tag
    return tag.replace(match![0], `src="${data}"`)
  })
}

/** 隐藏导出窗口不允许脚本/内嵌页面执行，避免文档内容带出本地信息 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\s(?:href|src|action)\s*=\s*(["'])\s*(?:javascript|vbscript):[^"']*\1/gi,
      ''
    )
    .replace(/\s(?:href|src|action)\s*=\s*(?:javascript|vbscript):[^\s>]+/gi, '')
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'inkdown-export-'))
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function writeTempHtml(dir: string, html: string): Promise<string> {
  const path = join(dir, 'document.html')
  await fs.writeFile(path, html, 'utf8')
  return path
}

async function waitForDocument(win: BrowserWindow): Promise<void> {
  await win.webContents.executeJavaScript(`(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      })
    ));
    await new Promise((resolve) => setTimeout(resolve, 60));
  })()`)
}

async function createExportWindow(
  htmlPath: string,
  dark: boolean,
  opts: { width?: number; height?: number; raster?: boolean } = {}
): Promise<BrowserWindow> {
  const width = opts.width ?? 1280
  const height = opts.height ?? 900
  const win = new BrowserWindow({
    // PNG / 元素栅格化需要真实绘制帧：隐藏窗口在 Windows 上不产生 frame，
    // 因此放到屏幕外显示（不抢焦点、不占任务栏），而不是 show:false。
    show: opts.raster === true,
    x: opts.raster ? -32000 : undefined,
    y: opts.raster ? 0 : undefined,
    skipTaskbar: opts.raster === true,
    focusable: opts.raster !== true,
    hasShadow: false,
    width,
    height,
    backgroundColor: dark ? '#1e1e1e' : '#ffffff',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  })
  if (opts.raster) win.setAlwaysOnTop(false)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  await win.loadFile(htmlPath)
  await waitForDocument(win)
  return win
}

async function attachDebugger(win: BrowserWindow): Promise<Electron.Debugger | null> {
  const dbg = win.webContents.debugger
  try {
    if (!dbg.isAttached()) dbg.attach('1.3')
    await dbg.sendCommand('Page.enable')
    return dbg
  } catch {
    return null
  }
}

async function rasterizeElements(
  win: BrowserWindow,
  kinds: Array<'mermaid' | 'math'>
): Promise<number> {
  if (kinds.length === 0) return 0
  const selector = kinds.map((kind) => `[data-export-raster="${kind}"]`).join(',')
  const rects = (await win.webContents.executeJavaScript(`(() => {
    window.__inkExportNodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    return window.__inkExportNodes.map((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height, x: rect.left + window.scrollX, y: rect.top + window.scrollY };
    });
  })()`)) as Array<{ width: number; height: number; x: number; y: number }>

  const dbg = await attachDebugger(win)
  if (!dbg) return 0

  try {
    for (let i = 0; i < rects.length; i += 1) {
      const rect = rects[i]
      if (rect.width < 1 || rect.height < 1) continue
      const scale = Math.max(1, Math.min(2, 12000 / Math.max(rect.width, rect.height)))
      const shot = (await dbg.sendCommand('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true,
        omitBackground: true,
        clip: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          scale
        }
      })) as { data: string }

      const url = `data:image/png;base64,${shot.data}`
      const height = Math.ceil(rect.height)
      await win.webContents.executeJavaScript(`(() => {
        const el = window.__inkExportNodes?.[${i}];
        if (!el || !el.isConnected) return;
        const img = document.createElement('img');
        img.src = ${JSON.stringify(url)};
        img.style.height = '${height}px';
        img.style.width = 'auto';
        img.style.maxWidth = '100%';
        img.style.verticalAlign = 'middle';
        img.className = 'md-raster';
        el.replaceWith(img);
      })()`)
    }
    return rects.length
  } finally {
    try {
      dbg.detach()
    } catch {
      // 窗口关闭时 debugger 可能已断开
    }
  }
}

async function preparedHtml(
  payload: ExportPayload,
  warnings: string[]
): Promise<string> {
  const inlined = await inlineImages(payload.html, payload.docPath, warnings)
  return sanitizeHtml(inlined)
}

async function htmlForRasterized(
  payload: ExportPayload,
  kinds: Array<'mermaid' | 'math'>,
  warnings: string[]
): Promise<string> {
  const html = await preparedHtml(payload, warnings)
  return withTempDir(async (dir) => {
    const htmlPath = await writeTempHtml(dir, html)
    const win = await createExportWindow(htmlPath, payload.dark, { raster: true })
    try {
      await rasterizeElements(win, kinds)
      return (await win.webContents.executeJavaScript(
        'document.documentElement.outerHTML'
      )) as string
    } finally {
      win.destroy()
    }
  })
}

async function renderPdf(payload: ExportPayload, warnings: string[]): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const html = await preparedHtml(payload, warnings)
    const htmlPath = await writeTempHtml(dir, html)
    const win = await createExportWindow(htmlPath, payload.dark)
    try {
      const footer = `<div style="width:100%;box-sizing:border-box;padding:0 18mm;font-size:9px;color:#888;text-align:center;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`
      return await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.6, bottom: 0.7, left: 0.7, right: 0.7 },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: footer,
        generateDocumentOutline: true,
        generateTaggedPDF: true
      })
    } finally {
      win.destroy()
    }
  })
}

async function renderPng(payload: ExportPayload, warnings: string[]): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const html = await preparedHtml(payload, warnings)
    const htmlPath = await writeTempHtml(dir, html)
    const win = await createExportWindow(htmlPath, payload.dark, {
      width: 940,
      height: 900,
      raster: true
    })
    const dbg = await attachDebugger(win)
    if (!dbg) {
      win.destroy()
      throw new Error(mainT(payload.language, 'error.exportFailed'))
    }
    try {
      const metrics = (await dbg.sendCommand('Page.getLayoutMetrics')) as {
        cssContentSize: { width: number; height: number }
      }
      const width = Math.max(1, Math.ceil(metrics.cssContentSize.width))
      const height = Math.max(1, Math.ceil(metrics.cssContentSize.height))
      const dpr = Math.max(
        1,
        Number(await win.webContents.executeJavaScript('window.devicePixelRatio')) || 1
      )
      // CDP 的 clip.scale 会再乘上 devicePixelRatio，这里按目标 2x 折算
      let scale = Math.min(2, Math.max(0.5, 2 / dpr))
      const limit = 16000
      if (width * scale * dpr > limit || height * scale * dpr > limit) {
        scale = Math.min(
          scale,
          limit / (Math.max(width, height) * dpr)
        )
        warnings.push('pngScaled')
      }
      if (scale * dpr * height > limit) {
        warnings.push('pngTooTall')
      }
      if (height > 60000) warnings.push('pngTooTall')
      const outHeight = Math.min(
        height,
        Math.max(1, Math.floor(limit / (scale * dpr)))
      )
      const shot = (await dbg.sendCommand('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: outHeight, scale }
      })) as { data: string }
      return Buffer.from(shot.data, 'base64')
    } finally {
      try {
        dbg.detach()
      } catch {
        // ignore
      }
      win.destroy()
    }
  })
}

async function runPandoc(args: string[], cwd: string): Promise<void> {
  await execFileAsync('pandoc', args, {
    timeout: 120_000,
    windowsHide: true,
    cwd,
    maxBuffer: 16 * 1024 * 1024
  })
}

async function renderDocx(
  payload: ExportPayload,
  capabilities: ExportCapabilities,
  warnings: string[]
): Promise<Buffer> {
  const rasterKinds: Array<'mermaid' | 'math'> = capabilities.pandoc
    ? ['mermaid']
    : ['mermaid', 'math']
  const html = await htmlForRasterized(payload, rasterKinds, warnings)

  if (capabilities.pandoc) {
    try {
      return await withTempDir(async (dir) => {
        const input = await writeTempHtml(dir, html)
        const output = join(dir, 'out.docx')
        await runPandoc(
          [
            input,
            '-f',
            'html',
            '-t',
            'docx',
            '-o',
            output,
            '--metadata',
            `title=${payload.title}`
          ],
          dir
        )
        return await fs.readFile(output)
      })
    } catch {
      warnings.push('pandocFailed')
    }
  } else {
    warnings.push('pandocMissing')
  }

  // 内置 docx 转换器体积较大，只在缺少 Pandoc 时加载
  const { default: HTMLtoDOCX } = await import('@turbodocx/html-to-docx')
  const result = await HTMLtoDOCX(
    html,
    null,
    {
      title: payload.title,
      lang: payload.language === 'zh' ? 'zh-CN' : 'en-US',
      font: payload.language === 'zh' ? 'Microsoft YaHei' : 'Calibri',
      fontSize: 22,
      pageNumber: true,
      footer: true,
      table: { row: { cantSplit: true } }
    },
    null
  )
  if (Buffer.isBuffer(result)) return result
  if (result instanceof ArrayBuffer) return Buffer.from(result)
  return Buffer.from(await result.arrayBuffer())
}

async function renderLatex(
  payload: ExportPayload,
  capabilities: ExportCapabilities,
  warnings: string[]
): Promise<string> {
  if (capabilities.pandoc) {
    try {
      const html = await htmlForRasterized(payload, ['mermaid'], warnings)
      return await withTempDir(async (dir) => {
        const input = await writeTempHtml(dir, html)
        const output = join(dir, 'out.tex')
        await runPandoc([input, '-f', 'html', '-t', 'latex', '-s', '-o', output], dir)
        return await fs.readFile(output, 'utf8')
      })
    } catch {
      warnings.push('pandocFailed')
    }
  } else {
    warnings.push('pandocMissing')
  }
  if (!payload.latex) throw new Error(mainT(payload.language, 'error.exportFailed'))
  return payload.latex
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function extractDataImages(html: string): { html: string; files: Array<{ name: string; data: Buffer; mime: string }> } {
  const files: Array<{ name: string; data: Buffer; mime: string }> = []
  let index = 0
  const output = html.replace(
    /(<img\b[^>]*?\bsrc=)"data:(image\/(?:png|jpeg|jpg|gif|webp|svg\+xml));base64,([^"]+)"/gi,
    (_match, prefix: string, mime: string, data: string) => {
      index += 1
      const ext = mime.includes('svg') ? 'svg' : mime.split('/')[1].replace('jpeg', 'jpg')
      const name = `images/image-${index}.${ext}`
      files.push({ name, data: Buffer.from(data, 'base64'), mime })
      return `${prefix}"${name}"`
    }
  )
  return { html: output, files }
}

function epubNav(toc: ExportPayload['toc']): string {
  if (toc.length === 0) {
    return '<li><a href="content.xhtml">文档</a></li>'
  }
  return toc
    .map(
      (entry) =>
        `<li class="level-${entry.level}"><a href="content.xhtml#${xmlEscape(entry.id)}">${xmlEscape(
          entry.text
        )}</a></li>`
    )
    .join('\n')
}

async function buildEpub(payload: ExportPayload, warnings: string[]): Promise<Buffer> {
  const html = await htmlForRasterized(payload, ['mermaid'], warnings)
  const inlined = await inlineImages(html, payload.docPath, warnings)
  const extracted = extractDataImages(sanitizeHtml(inlined))

  const style = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(extracted.html)?.[1] ?? ''
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(extracted.html)?.[1] ?? extracted.html
  const lang = payload.language === 'zh' ? 'zh' : 'en'
  const uuid = `urn:uuid:${randomUUID()}`
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  const content = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${xmlEscape(payload.title)}</title>
<link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body class="markdown-body inkdown-export">
${body}
</body>
</html>
`

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><meta charset="utf-8" /><title>${xmlEscape(payload.title)}</title></head>
<body>
<nav epub:type="toc" id="toc">
<h1>${lang === 'zh' ? '目录' : 'Contents'}</h1>
<ol>
${epubNav(payload.toc)}
</ol>
</nav>
</body>
</html>
`

  const manifestFiles = extracted.files
    .map(
      (file, i) =>
        `    <item id="image-${i + 1}" href="${file.name}" media-type="${file.mime}" />`
    )
    .join('\n')

  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${uuid}</dc:identifier>
    <dc:title>${xmlEscape(payload.title)}</dc:title>
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml" />
    <item id="style" href="style.css" media-type="text/css" />
${manifestFiles}
  </manifest>
  <spine>
    <itemref idref="content" />
  </spine>
</package>
`

  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>
`

  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', container)
  zip.file('OEBPS/content.opf', opf)
  zip.file('OEBPS/nav.xhtml', nav)
  zip.file('OEBPS/content.xhtml', content)
  zip.file('OEBPS/style.css', style)
  for (const file of extracted.files) {
    zip.file(`OEBPS/${file.name}`, file.data)
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/epub+zip' })
}

async function renderEpub(
  payload: ExportPayload,
  capabilities: ExportCapabilities,
  warnings: string[]
): Promise<Buffer> {
  if (capabilities.pandoc) {
    try {
      const html = await htmlForRasterized(payload, ['mermaid'], warnings)
      return await withTempDir(async (dir) => {
        const input = await writeTempHtml(dir, html)
        const output = join(dir, 'out.epub')
        await runPandoc(
          [
            input,
            '-f',
            'html',
            '-t',
            'epub3',
            '-o',
            output,
            '--metadata',
            `title=${payload.title}`,
            '--metadata',
            `lang=${payload.language === 'zh' ? 'zh' : 'en'}`
          ],
          dir
        )
        return await fs.readFile(output)
      })
    } catch {
      warnings.push('pandocFailed')
    }
  } else {
    warnings.push('pandocMissing')
  }
  return buildEpub(payload, warnings)
}

async function writeOutput(path: string, data: Buffer | string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  await fs.writeFile(temp, data)
  await fs.rename(temp, path)
}

export async function runExport(payload: ExportPayload): Promise<ExportResult> {
  const warnings: string[] = []
  const capabilities = await probePandoc()
  let usedPandoc = false

  switch (payload.format) {
    case 'html': {
      const html = await preparedHtml(payload, warnings)
      await writeOutput(payload.path, html)
      break
    }
    case 'pdf': {
      await writeOutput(payload.path, await renderPdf(payload, warnings))
      break
    }
    case 'png': {
      await writeOutput(payload.path, await renderPng(payload, warnings))
      break
    }
    case 'docx': {
      const docx = await renderDocx(payload, capabilities, warnings)
      usedPandoc = capabilities.pandoc && !warnings.includes('pandocFailed')
      await writeOutput(payload.path, docx)
      break
    }
    case 'latex': {
      const tex = await renderLatex(payload, capabilities, warnings)
      usedPandoc = capabilities.pandoc && !warnings.includes('pandocFailed')
      await writeOutput(payload.path, tex)
      break
    }
    case 'epub': {
      const epub = await renderEpub(payload, capabilities, warnings)
      usedPandoc = capabilities.pandoc && !warnings.includes('pandocFailed')
      await writeOutput(payload.path, epub)
      break
    }
  }

  return { path: payload.path, usedPandoc, warnings: [...new Set(warnings)] }
}

export async function printExport(payload: ExportPayload): Promise<{ printed: boolean }> {
  const warnings: string[] = []
  return withTempDir(async (dir) => {
    const html = await preparedHtml(payload, warnings)
    const htmlPath = await writeTempHtml(dir, html)
    const win = await createExportWindow(htmlPath, payload.dark)
    try {
      return await new Promise<{ printed: boolean }>((resolvePrint) => {
        win.webContents.print(
          { silent: false, printBackground: true, pageSize: 'A4' },
          (success) => resolvePrint({ printed: success })
        )
      })
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  })
}

/** 供设置界面或故障排查显示 */
export function clearPandocCache(): void {
  pandocCache = null
}
