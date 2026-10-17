/**
 * Mermaid 渲染管线：缓存 + 并发队列。
 *
 * mermaid 包体积大且渲染是同步重活，动态 import 让首屏不背这块成本；
 * 同一份源码（同主题）只渲染一次，多个图表最多两路并行，其余排队。
 */

import { t } from '../../i18n'

type MermaidApi = (typeof import('mermaid'))['default']

const MAX_CONCURRENT = 2
const CACHE_LIMIT = 64

let apiPromise: Promise<MermaidApi> | null = null
let initializedTheme: string | null = null
let renderSeq = 0

let active = 0
const waiting: Array<() => void> = []

const cache = new Map<string, Promise<string>>()

function loadApi(): Promise<MermaidApi> {
  apiPromise ??= import('mermaid').then((module) => module.default)
  return apiPromise
}

function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waiting.push(() => {
      active += 1
      resolve()
    })
  })
}

function releaseSlot(): void {
  active -= 1
  waiting.shift()?.()
}

function themeName(dark: boolean): 'dark' | 'neutral' {
  return dark ? 'dark' : 'neutral'
}

async function renderNow(source: string, dark: boolean): Promise<string> {
  const api = await loadApi()
  const theme = themeName(dark)
  if (initializedTheme !== theme) {
    api.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme,
      fontFamily: "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif"
    })
    initializedTheme = theme
  }
  const { svg } = await api.render(`inkdown-mermaid-${(renderSeq += 1)}`, source)
  return svg
}

export function renderMermaid(source: string, dark: boolean): Promise<string> {
  const code = source.replace(/\r\n?/g, '\n').trim()
  if (!code) return Promise.reject(new Error(t('widget.mermaidEmpty')))

  const key = `${dark ? 'd' : 'l'}\u0000${code}`
  const hit = cache.get(key)
  if (hit) return hit

  const task = (async () => {
    await acquireSlot()
    try {
      return await renderNow(code, dark)
    } finally {
      releaseSlot()
    }
  })()

  cache.set(key, task)
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }

  task.catch(() => {
    // 失败结果不进缓存，修好语法后可以立即重试
    if (cache.get(key) === task) cache.delete(key)
  })

  return task
}

/** 仅测试与主题切换排查使用 */
export function clearMermaidCache(): void {
  cache.clear()
}
