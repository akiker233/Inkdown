/**
 * 生成 Markdown 文件关联图标 build/icon-md.svg/png/ico。
 * 用法：npx electron scripts/make-file-icon.cjs
 *
 * 与黑色应用图标区分：浅色圆角底 + 黑色文档轮廓 + 白色墨滴。
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SIZE = 1024
const BUILD_DIR = join(__dirname, '..', 'build')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="232" fill="#f4f4f5"/>
  <rect x="64" y="64" width="896" height="896" rx="184" fill="none" stroke="#d4d4d8" stroke-width="12"/>
  <path d="M268 196 h376 l136 136 v456 a60 60 0 0 1 -60 60 H268 a60 60 0 0 1 -60 -60 V256 a60 60 0 0 1 60 -60 Z" fill="#0a0a0b"/>
  <path d="M644 196 v84 a52 52 0 0 0 52 52 h84 Z" fill="#3f3f46"/>
  <path d="M512 316 C 512 316 379 481 379 578 A 133 133 0 1 0 645 578 C 645 481 512 316 512 316 Z" fill="#ffffff"/>
  <g fill="#0a0a0b">
    <rect x="438" y="548" width="148" height="24" rx="12" opacity="0.86"/>
    <rect x="456" y="596" width="112" height="24" rx="12" opacity="0.64"/>
    <rect x="476" y="644" width="72" height="24" rx="12" opacity="0.42"/>
  </g>
</svg>`

const PAGE = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}</style><body></body>`

function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const entries = []
  let offset = 6 + images.length * 16
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    webPreferences: { sandbox: true, contextIsolation: true, offscreen: false }
  })

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`)
    const dataUrl = await win.webContents.executeJavaScript(`
      (async () => {
        const img = new Image()
        img.src = 'data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}'
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = ${SIZE}
        canvas.height = ${SIZE}
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, ${SIZE}, ${SIZE})
        return canvas.toDataURL('image/png')
      })()
    `)
    const png = Buffer.from(dataUrl.split(',')[1], 'base64')
    const image = nativeImage.createFromBuffer(png)
    if (image.isEmpty()) throw new Error('canvas 输出的 PNG 为空')

    mkdirSync(BUILD_DIR, { recursive: true })
    writeFileSync(join(BUILD_DIR, 'icon-md.svg'), SVG, 'utf8')
    writeFileSync(join(BUILD_DIR, 'icon-md.png'), png)

    const images = ICO_SIZES.map((size) => ({
      size,
      png: image.resize({ width: size, height: size, quality: 'best' }).toPNG()
    }))
    writeFileSync(join(BUILD_DIR, 'icon-md.ico'), buildIco(images))

    console.log(`icon-md.png ${SIZE}x${SIZE}, icon-md.ico ${ICO_SIZES.join('/')}`)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    win.destroy()
    app.quit()
  }
})
