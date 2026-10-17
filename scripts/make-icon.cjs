/**
 * 生成 build/icon.png 与 build/icon.ico（无需第三方图形库）。
 * 用法：npx electron scripts/make-icon.cjs
 *
 * SVG 在渲染进程里画进 canvas 再取 PNG，避免依赖 sharp / ImageMagick，
 * 同时能保留圆角外的透明通道。
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SIZE = 1024
const BUILD_DIR = join(__dirname, '..', 'build')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="232" fill="#0a0a0b"/>
  <path d="M512 196 C 512 196 298 462 298 618 A 214 214 0 1 0 726 618 C 726 462 512 196 512 196 Z" fill="#ffffff"/>
  <g fill="#0a0a0b">
    <rect x="398" y="542" width="228" height="34" rx="17" opacity="0.82"/>
    <rect x="428" y="612" width="168" height="34" rx="17" opacity="0.62"/>
    <rect x="462" y="682" width="100" height="34" rx="17" opacity="0.40"/>
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
    writeFileSync(join(BUILD_DIR, 'icon.svg'), SVG, 'utf8')
    writeFileSync(join(BUILD_DIR, 'icon.png'), png)
    writeFileSync(
      join(BUILD_DIR, 'icon-window.png'),
      image.resize({ width: 256, height: 256, quality: 'best' }).toPNG()
    )

    const images = ICO_SIZES.map((size) => ({
      size,
      png: image.resize({ width: size, height: size, quality: 'best' }).toPNG()
    }))
    writeFileSync(join(BUILD_DIR, 'icon.ico'), buildIco(images))

    console.log(`icon.png ${image.getSize().width}x${image.getSize().height}, icon.ico ${ICO_SIZES.join('/')}`)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    win.destroy()
    app.quit()
  }
})
