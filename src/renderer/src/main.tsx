import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useEditorStore } from './app/store/editorStore'
import './styles/tokens.css'
import 'katex/dist/katex.min.css'
import './styles/app.css'
import './styles/markdown.css'

// 仅开发环境：给 CDP 验证脚本一个稳定的操作入口，生产构建会被摇掉
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__inkdown', {
    value: { store: useEditorStore, api: window.api },
    configurable: true
  })
}

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

// 刻意不用 StrictMode：其 effect 双调用会重复初始化 CodeMirror 的 EditorView
createRoot(container).render(<App />)
