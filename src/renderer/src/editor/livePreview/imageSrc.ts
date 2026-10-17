const REMOTE_RE = /^(?:https?:|data:|blob:)/i
const WINDOWS_ABSOLUTE_RE = /^[A-Za-z]:[\\/]/
const UNC_RE = /^\\\\/

/**
 * 把 Markdown 里的图片地址解析成 <img src> 可用的值：
 * - http(s)/data/blob 原样交给浏览器
 * - 绝对路径与相对路径统一走自建协议，避免 file:// 在沙箱里的限制
 *
 * 注意渲染进程拿不到 node:path，这里手工处理 Windows 分隔符与 ..。
 */
export function resolveImageSrc(raw: string, docPath: string): string {
  const src = normalizeLocalPath(raw, docPath)
  if (!src) return ''
  if (REMOTE_RE.test(src.source)) return src.source
  if (src.source.startsWith('file://')) return src.source
  return src.absolute ? assetUrl(src.absolute) : ''
}

/** 导出 LaTeX 等需要真实磁盘路径的场景：拿不到绝对路径时返回 null */
export function resolveLocalImagePath(raw: string, docPath: string): string | null {
  const src = normalizeLocalPath(raw, docPath)
  return src?.absolute ?? null
}

function normalizeLocalPath(
  raw: string,
  docPath: string
): { source: string; absolute: string | null } | null {
  let src = raw.trim()
  if (src.startsWith('<') && src.endsWith('>')) src = src.slice(1, -1).trim()
  if (!src) return null

  if (REMOTE_RE.test(src)) return { source: src, absolute: null }
  if (src.startsWith('file://')) return { source: src, absolute: fileUrlToPath(src) }

  try {
    if (/%[0-9a-f]{2}/i.test(src)) src = decodeURI(src)
  } catch {
    // 不是合法转义就按字面量处理
  }

  let absolute: string | null
  if (WINDOWS_ABSOLUTE_RE.test(src) || UNC_RE.test(src) || src.startsWith('/')) {
    absolute = src
  } else if (!docPath) {
    absolute = null
  } else {
    absolute = resolveRelative(docPath, src)
  }
  return { source: src, absolute }
}

function fileUrlToPath(url: string): string | null {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname)
    return pathname.replace(/^\/([A-Za-z]:)/, '$1')
  } catch {
    return null
  }
}

function resolveRelative(docPath: string, src: string): string {
  const parts = docPath.replace(/\\/g, '/').split('/')
  parts.pop()
  for (const segment of src.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      parts.pop()
      continue
    }
    parts.push(segment)
  }
  return parts.join('/')
}

function assetUrl(path: string): string {
  const encoded = path
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `inkdown-asset://local/${encoded}`
}
