/**
 * 开发辅助：通过 CDP 给运行中的应用窗口截图。
 * 用法：npx electron . --remote-debugging-port=9222 然后 node scripts/capture.mjs out.png
 * 依赖 Node 内置的全局 WebSocket，不需要额外包。
 */
const port = process.env.CDP_PORT ?? '9222'
const outPath = process.argv[2] ?? 'shot.png'

const listRes = await fetch(`http://127.0.0.1:${port}/json/list`)
const targets = await listRes.json()
const page = targets.find((t) => t.type === 'page')
if (!page) {
  console.error('未找到 page target：', JSON.stringify(targets, null, 2))
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

let nextId = 1
function send(method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(`${method} 失败: ${JSON.stringify(msg.error)}`))
      else resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

await send('Page.enable')
await send('Page.bringToFront')
const shot = await send('Page.captureScreenshot', { format: 'png' })
const { writeFileSync } = await import('node:fs')
writeFileSync(outPath, Buffer.from(shot.data, 'base64'))
console.log(`已保存截图: ${outPath}`)
ws.close()
