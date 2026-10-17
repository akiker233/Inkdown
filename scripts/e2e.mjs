/**
 * 零依赖端到端冒烟测试：启动真实应用 → 用 argv 打开 Markdown（模拟文件关联）
 * → 编辑 → Ctrl+S → 断言行盘 → 校验版本/平台/userData 隔离 → 退出。
 *
 * 默认跑构建后的开发版（out/）；`--packaged` 跑 releases/<version>/win-unpacked/Inkdown.exe。
 * 可用 E2E_EXE 指定其它可执行文件。CI 里两条链路都会跑。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const packaged = process.argv.includes('--packaged')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function connect(port, { page = false, timeout = 30_000 } = {}) {
  const deadline = Date.now() + timeout
  let target = null
  while (!target && Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = page ? targets.find((item) => item.type === 'page') : targets[0]
    } catch {
      // 调试端口还未就绪
    }
    if (!target) await sleep(200)
  }
  if (!target) throw new Error(`调试端口 ${port} 未就绪`)

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  let nextId = 1
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      const onMessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.id !== id) return
        ws.removeEventListener('message', onMessage)
        if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`))
        else resolve(message.result)
      }
      ws.addEventListener('message', onMessage)
      ws.send(JSON.stringify({ id, method, params }))
    })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? '求值失败')
    }
    return result.result?.value
  }

  return { send, evaluate, close: () => ws.close() }
}

async function waitFor(label, check, timeout = 20_000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    last = await check()
    if (last) return last
    await sleep(250)
  }
  throw new Error(`等待超时：${label}`)
}

async function pressCtrlS(client) {
  const base = {
    modifiers: 2,
    code: 'KeyS',
    key: 's',
    windowsVirtualKeyCode: 83,
    nativeVirtualKeyCode: 83
  }
  await client.send('Input.dispatchKeyEvent', { ...base, type: 'rawKeyDown' })
  await client.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' })
}

function killTree(child) {
  if (child.exitCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGKILL')
  }
}

const id = Date.now().toString(36)
const tempRoot = join(tmpdir(), `inkdown-e2e-${id}`)
const userData = join(tempRoot, 'user-data')
const fixture = join(tempRoot, 'e2e-fixture.md')
const marker = `E2E-MARKER-${id}`
const results = []
let child = null
let renderer = null
const logs = []
let assocTouched = false

function pass(message) {
  results.push(message)
  console.log(`PASS  ${message}`)
}

try {
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({ language: 'zh', autoSave: false, theme: 'light' }, null, 2)
  )
  writeFileSync(
    fixture,
    '# E2E 标题\n\n文件关联启动测试。\n\n```js\nconst answer = 42\n```\n',
    'utf8'
  )

  const exe = packaged
    ? process.env.E2E_EXE ?? join(root, 'releases', pkg.version, 'win-unpacked', 'Inkdown.exe')
    : require('electron')
  if (packaged && !existsSync(exe)) {
    throw new Error(`未找到打包产物 ${exe}，请先运行 npm run dist:dir`)
  }
  if (!packaged && !existsSync(join(root, 'out', 'main', 'index.js'))) {
    throw new Error('未找到 out/，请先运行 npm run build')
  }

  const [debugPort, inspectPort] = [await freePort(), await freePort()]
  const args = packaged
    ? [`--remote-debugging-port=${debugPort}`, `--inspect=${inspectPort}`, `--user-data-dir=${userData}`, fixture]
    : ['.', `--remote-debugging-port=${debugPort}`, `--inspect=${inspectPort}`, `--user-data-dir=${userData}`, fixture]

  child = spawn(exe, args, {
    cwd: root,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()))
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()))

  const exitPromise = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))

  renderer = await connect(debugPort, { page: true })
  await renderer.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {})
  await renderer.send('Page.bringToFront').catch(() => {})
  await renderer.send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {})
  pass('应用启动并建立 CDP 连接')

  const editor = await waitFor('编辑器打开 fixture', async () => {
    const state = await renderer.evaluate(`(() => {
      const el = document.querySelector('.cm-content')
      return el ? { text: el.innerText, body: document.body.innerText.slice(0, 200) } : null
    })()`)
    return state && state.text.includes('E2E 标题') ? state : null
  })
  pass('argv 文件关联路径已打开到编辑器')

  const rect = await renderer.evaluate(`(() => {
    const r = document.querySelector('.cm-content').getBoundingClientRect()
    return { x: Math.round(r.left + 80), y: Math.round(r.top + 40) }
  })()`)
  await renderer.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y })
  await renderer.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: rect.x,
    y: rect.y,
    button: 'left',
    buttons: 1,
    clickCount: 1
  })
  await renderer.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: rect.x,
    y: rect.y,
    button: 'left',
    buttons: 0,
    clickCount: 1
  })
  // 光标移到文档末尾再输入，避免把标题文字劈开
  const endKey = {
    modifiers: 2,
    code: 'End',
    key: 'End',
    windowsVirtualKeyCode: 35,
    nativeVirtualKeyCode: 35
  }
  await renderer.send('Input.dispatchKeyEvent', { ...endKey, type: 'rawKeyDown' })
  await renderer.send('Input.dispatchKeyEvent', { ...endKey, type: 'keyUp' })
  await renderer.send('Input.insertText', { text: `\n\n${marker}\n` })
  const edited = await waitFor('编辑器接收输入', async () => {
    const text = await renderer.evaluate(
      `(() => { const el = document.querySelector('.cm-content'); return el ? el.innerText : '' })()`
    )
    return text.includes(marker) ? text : null
  })
  if (!edited.includes('E2E 标题') || !edited.includes('const answer = 42')) {
    throw new Error(`输入后原有文档内容丢失\n之前: ${JSON.stringify(editor.text)}\n之后: ${JSON.stringify(edited)}`)
  }
  pass('编辑器可输入且文档内容完整')

  await pressCtrlS(renderer)
  const savedByAccelerator = await waitFor(
    'Ctrl+S 落盘',
    () => (readFileSync(fixture, 'utf8').includes(marker) ? true : null),
    6_000
  ).catch(() => null)

  if (!savedByAccelerator) {
    // 后台窗口可能收不到原生加速键；退化为从主进程派发同一条菜单命令（仍走真实保存链路）
    const main = await connect(inspectPort, { timeout: 10_000 })
    await main.evaluate(`(async () => {
      const { createRequire } = process.getBuiltinModule('module')
      const { BrowserWindow } = createRequire(process.execPath)('electron')
      const win = BrowserWindow.getAllWindows()[0]
      win.webContents.send('event:menu-command', { command: 'file.save' })
      return true
    })()`)
    main.close()
    await waitFor(
      '菜单保存命令落盘',
      () => (readFileSync(fixture, 'utf8').includes(marker) ? true : null),
      8_000
    )
    pass('保存命令落盘（加速键未送达，已用主进程派发兜底）')
  } else {
    pass('Ctrl+S 保存并落盘')
  }

  const info = await renderer.evaluate('window.api.app.getInfo()')
  if (info.version !== pkg.version) {
    throw new Error(`版本不一致：应用 ${info.version}，package.json ${pkg.version}`)
  }
  if (info.platform !== 'win32') throw new Error(`平台异常：${info.platform}`)
  if (info.userDataPath.toLowerCase() !== userData.toLowerCase()) {
    throw new Error(`userData 未隔离：${info.userDataPath}`)
  }
  pass(`版本 ${info.version} / 平台 ${info.platform} / userData 隔离`)

  const settings = await renderer.evaluate('window.api.app.getSettings()')
  if (settings.autoUpdate !== false || settings.updateFeedUrl !== null) {
    throw new Error(`自动更新应默认关闭且无更新源：${JSON.stringify(settings)}`)
  }
  const main = await connect(inspectPort, { timeout: 10_000 })
  const updateMenu = await main.evaluate(`(async () => {
    const { createRequire } = process.getBuiltinModule('module')
    const { Menu } = createRequire(process.execPath)('electron')
    const labels = []
    const walk = (items) => {
      for (const item of items ?? []) {
        labels.push(item.label)
        if (item.submenu) walk(item.submenu.items)
      }
    }
    walk(Menu.getApplicationMenu()?.items)
    return labels.find((label) => label.includes('检查更新') || label.includes('Check for Updates')) ?? null
  })()`)
  main.close()
  if (!updateMenu) throw new Error('未找到“检查更新”菜单项')
  pass('自动更新默认关闭且“检查更新”入口存在')

  let assoc = await renderer.evaluate('window.api.fileAssoc.get()')
  if (packaged) {
    if (!assoc.supported || assoc.reason !== null) {
      throw new Error(`安装版应支持文件关联：${JSON.stringify(assoc)}`)
    }
    // 升级后首次启动会在后台逐项刷新旧关联，注册表同步完成前不能断言默认状态
    for (let i = 0; assoc.contextMenu && i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      assoc = await renderer.evaluate('window.api.fileAssoc.get()')
    }
    if (assoc.contextMenu) throw new Error('右键菜单不应默认开启')

    const enabled = await renderer.evaluate('window.api.fileAssoc.setContextMenu(true)')
    assocTouched = true
    if (!enabled.contextMenu) throw new Error('右键菜单开启失败')
    const registered = spawnSync(
      'reg',
      ['query', 'HKCU\\Software\\Classes\\SystemFileAssociations\\.md\\shell\\Inkdown\\command', '/ve'],
      { encoding: 'utf8' }
    )
    if (registered.status !== 0 || !registered.stdout.includes('Inkdown.exe')) {
      throw new Error(`右键菜单注册表未写入：${registered.stderr || registered.stdout}`)
    }

    const settingsOn = await renderer.evaluate('window.api.app.getSettings()')
    if (settingsOn.markdownContextMenu !== true) throw new Error('右键菜单开关未持久化')

    const disabled = await renderer.evaluate('window.api.fileAssoc.setContextMenu(false)')
    if (disabled.contextMenu) throw new Error('右键菜单关闭失败')
    const removed = spawnSync(
      'reg',
      ['query', 'HKCU\\Software\\Classes\\SystemFileAssociations\\.md\\shell\\Inkdown', '/ve'],
      { encoding: 'utf8' }
    )
    if (removed.status === 0) throw new Error('右键菜单注册表未清理')
    assocTouched = false

    const settingsOff = await renderer.evaluate('window.api.app.getSettings()')
    if (settingsOff.markdownContextMenu !== false) throw new Error('右键菜单关闭状态未持久化')
    pass('右键菜单注册 / 注销与设置持久化')
  } else {
    if (assoc.supported || assoc.reason !== 'dev') {
      throw new Error(`开发模式应禁用文件关联：${JSON.stringify(assoc)}`)
    }
    pass('开发模式正确禁用文件关联注册')
  }

  const finalText = readFileSync(fixture, 'utf8')
  if (!finalText.includes(marker) || !finalText.includes('const answer = 42')) {
    throw new Error('落盘内容不完整')
  }
  pass('落盘内容包含新增文本与原始代码块')

  // 关闭时渲染进程会先销毁，求值 Promise 永远不结算，因此不能 await
  void renderer.evaluate('window.api.window.forceClose()').catch(() => {})
  renderer.close()
  renderer = null
  const exit = await Promise.race([exitPromise, sleep(10_000).then(() => null)])
  if (!exit) throw new Error('应用未在 10 秒内退出')
  child = null

  console.log(`\nE2E PASS（${packaged ? '打包版' : '开发版'}，${results.length} 项）`)
} catch (error) {
  console.error(`\nE2E FAIL: ${error instanceof Error ? error.message : error}`)
  if (logs?.length) console.error(`\n--- app log ---\n${logs.join('').slice(-4000)}`)
  process.exitCode = 1
  try {
    if (renderer) {
      void renderer.evaluate('window.api.window.forceClose()').catch(() => {})
      renderer.close()
      renderer = null
    }
  } catch {
    // 应用可能已崩溃，交给下面的 killTree
  }
} finally {
  if (assocTouched) {
    for (const ext of ['.md', '.markdown', '.mdown', '.mkd', '.mdx']) {
      spawnSync(
        'reg',
        ['delete', `HKCU\\Software\\Classes\\SystemFileAssociations\\${ext}\\shell\\Inkdown`, '/f'],
        { stdio: 'ignore' }
      )
    }
  }
  if (child) killTree(child)
  rmSync(tempRoot, { recursive: true, force: true })
}
