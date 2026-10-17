/**
 * 开发辅助：通过 Node inspector 在主进程里求值。
 * 启动：npx electron . --inspect=9299 --remote-debugging-port=9222
 * 用法：node scripts/main-eval.mjs "return require('electron').app.getName()"
 */
const port = process.env.MAIN_INSPECT_PORT ?? '9299'
const code = process.argv[2]
if (!code) {
  console.error('用法: node scripts/main-eval.mjs "<表达式>"')
  process.exit(1)
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target = targets[0]
if (!target) {
  console.error('未找到主进程调试目标')
  process.exit(1)
}

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
})

const id = 1
const result = await new Promise((resolve, reject) => {
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id !== id) return
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  })
  ws.send(
    JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression: `(async () => { ${code} })()`, awaitPromise: true, returnByValue: true }
    })
  )
})

ws.close()
if (result.exceptionDetails) {
  console.error(result.exceptionDetails.exception?.description ?? '求值失败')
  process.exit(1)
}
console.log(JSON.stringify(result.result?.value, null, 2))
