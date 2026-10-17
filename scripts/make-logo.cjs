/**
 * 生成品牌 logo：黑白横版组合标（浅/深色）、独立标记与 PNG 预览。
 * 用法：npx electron scripts/make-logo.cjs
 */
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const BUILD_DIR = join(__dirname, '..', 'build')
const FONT = "'Segoe UI Variable Display','Segoe UI',Inter,system-ui,sans-serif"

function mark({ inverted }) {
  const tile = inverted ? '#fafafa' : '#0a0a0b'
  const drop = inverted ? '#0a0a0b' : '#ffffff'
  const line = inverted ? '#fafafa' : '#0a0a0b'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="232" fill="${tile}"/>
  <path d="M512 196 C 512 196 298 462 298 618 A 214 214 0 1 0 726 618 C 726 462 512 196 512 196 Z" fill="${drop}"/>
  <g fill="${line}">
    <rect x="398" y="542" width="228" height="34" rx="17" opacity="0.82"/>
    <rect x="428" y="612" width="168" height="34" rx="17" opacity="0.62"/>
    <rect x="462" y="682" width="100" height="34" rx="17" opacity="0.40"/>
  </g>
</svg>`
}

function lockup({ inverted }) {
  const ink = inverted ? '#71717a' : '#0a0a0b'
  const down = inverted ? '#a1a1aa' : '#52525b'
  const desc = inverted ? '#8b8b94' : '#71717a'
  const inner = mark({ inverted })
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="480" viewBox="0 0 900 240">
  <g transform="scale(0.234375)">${inner}</g>
  <text x="296" y="168" font-family="${FONT}" font-size="154" font-weight="700" letter-spacing="-5" fill="${ink}">ink<tspan fill="${down}">down</tspan></text>
  <text x="300" y="220" font-family="${FONT}" font-size="25" font-weight="600" letter-spacing="7.5" fill="${desc}">MARKDOWN EDITOR</text>
</svg>`
}

const PAGE = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}</style><body></body>'

async function render(win, svg, width, height) {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  const dataUrl = await win.webContents.executeJavaScript(`
    (async () => {
      const img = new Image()
      img.src = ${JSON.stringify(src)}
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = ${width}
      canvas.height = ${height}
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, ${width}, ${height})
      return canvas.toDataURL('image/png')
    })()
  `)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1800,
    height: 480,
    show: false,
    frame: false,
    webPreferences: { sandbox: true, contextIsolation: true, offscreen: false }
  })

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`)
    mkdirSync(BUILD_DIR, { recursive: true })

    const light = lockup({ inverted: false })
    const dark = lockup({ inverted: true })
    const markLight = mark({ inverted: false })
    const markDark = mark({ inverted: true })

    writeFileSync(join(BUILD_DIR, 'logo.svg'), light, 'utf8')
    writeFileSync(join(BUILD_DIR, 'logo-dark.svg'), dark, 'utf8')
    writeFileSync(join(BUILD_DIR, 'logo-mark.svg'), markLight, 'utf8')
    writeFileSync(join(BUILD_DIR, 'logo-mark-dark.svg'), markDark, 'utf8')
    writeFileSync(join(BUILD_DIR, 'logo.png'), await render(win, light, 1800, 480))
    writeFileSync(join(BUILD_DIR, 'logo-dark.png'), await render(win, dark, 1800, 480))
    writeFileSync(join(BUILD_DIR, 'logo-mark.png'), await render(win, markLight, 1024, 1024))
    writeFileSync(join(BUILD_DIR, 'logo-mark-dark.png'), await render(win, markDark, 1024, 1024))

    console.log('logo / logo-mark (light & dark) + PNG (1800x480, 1024x1024)')
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    win.destroy()
    app.quit()
  }
})
