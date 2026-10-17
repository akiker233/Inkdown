import { extname, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'

export const ASSET_SCHEME = 'inkdown-asset'

const IMAGE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.avif',
  '.ico'
])

/**
 * 自定义协议必须在 app ready 之前注册为 privileged，
 * 否则渲染进程里的 <img> 不会把它当成安全来源。
 */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/**
 * 只允许读取图片扩展名，避免这个协议被当成任意本地文件读取器。
 * URL 形式：inkdown-asset://local/<percent-encoded absolute path>
 */
export function registerAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'local') return new Response('Not found', { status: 404 })

      let pathname = decodeURIComponent(url.pathname)
      if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1)

      const filePath = normalize(pathname)
      if (!IMAGE_EXT.has(extname(filePath).toLowerCase())) {
        return new Response('Forbidden', { status: 403 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
