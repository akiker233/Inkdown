/** 渲染进程的路径工具。Windows 优先：比较时统一分隔符并忽略大小写。 */

export const MD_EXT_RE = /\.(md|markdown|mdown|mkd|mdx)$/i

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export function dirName(path: string): string {
  const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return index < 0 ? '' : path.slice(0, index)
}

export function joinPath(dir: string, name: string): string {
  if (!dir) return name
  const separator = dir.includes('\\') ? '\\' : '/'
  return dir.endsWith(separator) ? `${dir}${name}` : `${dir}${separator}${name}`
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

export function isSamePath(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b)
}

export function isUnder(path: string, root: string): boolean {
  const p = normalizePath(path)
  const r = normalizePath(root)
  return p === r || p.startsWith(r.endsWith('/') ? r : `${r}/`)
}

export function remapPath(path: string, from: string, to: string): string | null {
  if (isSamePath(path, from)) return to
  if (isUnder(path, from)) return to + path.slice(from.length)
  return null
}
