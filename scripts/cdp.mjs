/**
 * 开发辅助：在运行中的应用里执行一段 JS / 派发按键，并打印结果。
 * 依赖 Node 内置的全局 WebSocket，不需要额外包。
 *
 * 用法（先在另一个终端 `npx electron . --remote-debugging-port=9222`）：
 *   node scripts/cdp.mjs "<表达式>"             求值并打印
 *   node scripts/cdp.mjs --file test/eval.js    从文件读多行脚本（需自己写 return）
 *   node scripts/cdp.mjs --key Control+s        派发加速键（可触发原生菜单快捷键）
 *   node scripts/cdp.mjs --text "你好"          向当前焦点插入文本
 *
 * 求值代码会被包进 async IIFE，不会污染页面全局作用域。
 * 单行表达式直接写；多语句片段需要自己写 return，例如：
 *   node scripts/cdp.mjs "const a = 1; return a + 1"
 * 端口可用环境变量 CDP_PORT 覆盖。
 */
import { readFileSync } from 'node:fs'

const port = process.env.CDP_PORT ?? '9222'
const [mode, value] = process.argv.slice(2)

if (!mode) {
  console.error('用法: node scripts/cdp.mjs "<表达式>" | --key Control+s | --text "内容"')
  process.exit(1)
}

const MODIFIER_FLAGS = { alt: 1, ctrl: 2, control: 2, meta: 4, shift: 8 }
const KEY_CODES = {
  enter: { code: 'Enter', key: 'Enter', vk: 13 },
  escape: { code: 'Escape', key: 'Escape', vk: 27 },
  tab: { code: 'Tab', key: 'Tab', vk: 9 },
  ' ': { code: 'Space', key: ' ', vk: 32 },
  home: { code: 'Home', key: 'Home', vk: 36 },
  end: { code: 'End', key: 'End', vk: 35 },
  arrowleft: { code: 'ArrowLeft', key: 'ArrowLeft', vk: 37 },
  arrowup: { code: 'ArrowUp', key: 'ArrowUp', vk: 38 },
  arrowright: { code: 'ArrowRight', key: 'ArrowRight', vk: 39 },
  arrowdown: { code: 'ArrowDown', key: 'ArrowDown', vk: 40 },
  backspace: { code: 'Backspace', key: 'Backspace', vk: 8 },
  delete: { code: 'Delete', key: 'Delete', vk: 46 },
  '/': { code: 'Slash', key: '/', vk: 191 },
  '-': { code: 'Minus', key: '-', vk: 189 },
  '=': { code: 'Equal', key: '=', vk: 187 },
  '[': { code: 'BracketLeft', key: '[', vk: 219 },
  ']': { code: 'BracketRight', key: ']', vk: 221 },
  '`': { code: 'Backquote', key: '`', vk: 192 },
  '~': { code: 'Backquote', key: '~', vk: 192 }
}

function resolveKey(name) {
  const lower = name.toLowerCase()
  if (KEY_CODES[lower]) return KEY_CODES[lower]
  if (/^[a-z]$/.test(lower)) {
    return { code: `Key${lower.toUpperCase()}`, key: lower, vk: lower.toUpperCase().charCodeAt(0) }
  }
  if (/^[0-9]$/.test(lower)) return { code: `Digit${lower}`, key: lower, vk: lower.charCodeAt(0) }
  if (/^f([1-9]|1[0-2])$/.test(lower)) {
    const upper = lower.toUpperCase()
    return { code: upper, key: upper, vk: 111 + Number(lower.slice(1)) }
  }
  throw new Error(`不认识的按键: ${name}`)
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
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

function evaluate(expression) {
  return send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
}

/** 窗口隐藏/最小化时输入事件会被丢弃，先让页面进入活跃聚焦状态 */
async function wakePage() {
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
  await send('Page.bringToFront').catch(() => {})
  await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {})
}

/** 加速键必须走 rawKeyDown；char 类型事件不会触发原生菜单快捷键 */
async function pressAccelerator(combo) {
  const parts = combo.split('+').map((p) => p.trim())
  const keyName = parts.pop()
  const modifiers = parts.reduce((acc, p) => acc | (MODIFIER_FLAGS[p.toLowerCase()] ?? 0), 0)
  let resolved = resolveKey(keyName)
  // 真实键盘按住 Shift 时 event.key 是上档字符，CM 的键位匹配依赖这一点
  if (modifiers & 8) {
    const shifted = {
      '[': '{',
      ']': '}',
      '5': '%',
      '-': '_',
      '=': '+',
      '`': '~',
      '\\': '|',
      '/': '?'
    }[resolved.key]
    if (shifted) resolved = { ...resolved, key: shifted }
  }
  const { code, key, vk } = resolved
  const base = { modifiers, code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }
  await send('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown' })
  await send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' })
}

if (mode === '--key') {
  await wakePage()
  await pressAccelerator(value)
  console.log(`已派发按键: ${value}`)
} else if (mode === '--text') {
  await wakePage()
  await send('Input.insertText', { text: value ?? '' })
  console.log(`已插入文本: ${JSON.stringify(value ?? '')}`)
} else if (mode === '--move') {
  await wakePage()
  const [x, y] = (value ?? '').split(',').map(Number)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  console.log(`已移动鼠标: ${x},${y}`)
} else if (mode === '--click') {
  await wakePage()
  const [x, y] = (value ?? '').split(',').map(Number)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    console.error('用法: node scripts/cdp.mjs --click <x>,<y>')
    process.exit(1)
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 1
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    buttons: 0,
    clickCount: 1
  })
  console.log(`已点击: ${x},${y}`)
} else if (mode === '--file') {
  const result = await evaluate(`(async () => { ${readFileSync(value, 'utf8')} })()`)
  if (result.exceptionDetails) {
    console.error('执行出错：', JSON.stringify(result.exceptionDetails, null, 2))
    process.exitCode = 1
  } else {
    const out = result.result.value
    console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2))
  }
} else {
  // 窗口最小化时 CSS transition / rAF 不推进，先唤醒页面再求值
  await wakePage()
  // 先按"单个表达式"求值，解析失败再退回"多语句 + 显式 return"形式
  let result = await evaluate(`(async () => (${mode}))()`)
  if (result.exceptionDetails?.exception?.className === 'SyntaxError') {
    result = await evaluate(`(async () => { ${mode} })()`)
  }

  if (result.exceptionDetails) {
    console.error('执行出错：', JSON.stringify(result.exceptionDetails, null, 2))
    process.exitCode = 1
  } else {
    const out = result.result.value
    console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2))
  }
}

ws.close()
