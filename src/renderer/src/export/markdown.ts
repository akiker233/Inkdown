import MarkdownIt from 'markdown-it'
import type { Env, MarkdownIt as MarkdownItInstance, StateBlock, StateCore, StateInline, Token } from 'markdown-it'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import mark from 'markdown-it-mark'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import { full as emoji } from 'markdown-it-emoji'
import hljs from 'highlight.js/lib/common'
import katex from 'katex'
import type { ExportTocEntry } from '@shared/types/export'
import { resolveImageSrc } from '../editor/livePreview/imageSrc'
import { renderMermaid } from '../editor/livePreview/mermaid'

export interface RenderMarkdownOptions {
  docPath: string | null
  dark: boolean
  titleFallback?: string
  /** 测试与批处理可注入，默认走编辑器同一条 Mermaid 管线 */
  mermaidRenderer?: (source: string) => Promise<string>
}

export interface RenderMarkdownResult {
  html: string
  title: string
  author: string | null
  frontMatter: Record<string, string>
  toc: ExportTocEntry[]
  mermaidCount: number
}

interface ExportEnv extends Env {
  docPath?: string
  headings?: ExportTocEntry[]
}

const FENCE_RE = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\n]*)$/

/** 只在文档最开头识别 YAML front matter，避免把正文里的分隔线误吃掉 */
export function splitFrontMatter(markdown: string): {
  body: string
  data: Record<string, string>
} {
  const normalized = markdown.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  if (lines[0]?.trim() !== '---') return { body: normalized, data: {} }

  let end = -1
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (line === '---' || line === '...') {
      end = i
      break
    }
  }
  if (end < 0) return { body: normalized, data: {} }

  const data: Record<string, string> = {}
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!value || value.startsWith('[') || value.startsWith('{') || value.startsWith('|')) continue
    data[match[1].toLowerCase()] = value
  }
  return { body: lines.slice(end + 1).join('\n'), data }
}

/**
 * Mermaid 必须异步渲染，而 markdown-it 是同步的：
 * 先把 mermaid 围栏换成占位块，等 HTML 生成后再回填 SVG。
 * 占位块走 html_block 分支，不会破坏其它围栏的源码。
 */
export function extractMermaid(
  markdown: string
): { markdown: string; blocks: string[] } {
  const lines = markdown.split('\n')
  const out: string[] = []
  const blocks: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const match = FENCE_RE.exec(lines[i])
    if (!match) {
      out.push(lines[i])
      continue
    }

    const [, , fence, info] = match
    const lang = info.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    const marker = fence[0] === '`' ? '`' : '~'
    const closeRe = new RegExp(`^[ \\t]*${marker}{${fence.length},}[ \\t]*$`)

    let close = i + 1
    while (close < lines.length && !closeRe.test(lines[close])) close += 1

    if (lang === 'mermaid') {
      const index = blocks.length
      blocks.push(lines.slice(i + 1, close).join('\n'))
      out.push(`<div class="inkdown-mermaid-placeholder" data-mermaid-index="${index}"></div>`)
    } else {
      for (let k = i; k <= close && k < lines.length; k += 1) out.push(lines[k])
    }
    i = close
  }

  return { markdown: out.join('\n'), blocks }
}

export function slugifyHeading(text: string): string {
  const slug = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~$[\](){}#!|]/g, '')
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'section'
}

function uniqueId(base: string, used: Map<string, number>): string {
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

function plainText(token: Token | undefined): string {
  if (!token) return ''
  if (!token.children) return token.content
  let out = ''
  for (const child of token.children) {
    if (
      child.type === 'text' ||
      child.type === 'code_inline' ||
      child.type === 'emoji' ||
      child.type === 'html_inline'
    ) {
      out += child.type === 'html_inline' ? '' : child.content
    } else if (child.type === 'image') {
      out += child.content
    } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
      out += ' '
    }
  }
  return out.trim()
}

function renderMath(tex: string, display: boolean, escapeHtml: (s: string) => string): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      output: 'mathml',
      throwOnError: false,
      strict: 'ignore',
      trust: false
    })
  } catch {
    return `<span class="md-math is-error">${escapeHtml(tex)}</span>`
  }
}

function mathBlockRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  const start = state.bMarks[startLine] + state.tShift[startLine]
  const max = state.eMarks[startLine]
  const first = state.src.slice(start, max)
  const open = /^[ \t]*\$\$(.*)$/.exec(first)
  if (!open) return false

  const rest = open[1]
  const sameLine = rest.indexOf('$$')
  if (sameLine >= 0 && rest.slice(sameLine + 2).trim() === '') {
    const tex = rest.slice(0, sameLine).trim()
    if (!tex || silent) return Boolean(tex)
    const token = state.push('math_block', 'math', 0)
    token.block = true
    token.content = tex
    token.map = [startLine, startLine + 1]
    state.line = startLine + 1
    return true
  }

  const texLines: string[] = []
  if (rest.trim()) texLines.push(rest)
  let closeLine = -1
  for (let line = startLine + 1; line < endLine; line += 1) {
    const lineStart = state.bMarks[line] + state.tShift[line]
    const lineEnd = state.eMarks[line]
    const text = state.src.slice(lineStart, lineEnd)
    const close = /^(.*?)\$\$[ \t]*$/.exec(text)
    if (close) {
      if (close[1].trim()) texLines.push(close[1])
      closeLine = line
      break
    }
    texLines.push(text)
  }

  const tex = texLines.join('\n').trim()
  if (closeLine < 0 || !tex) return false
  if (silent) return true

  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = tex
  token.map = [startLine, closeLine + 1]
  state.line = closeLine + 1
  return true
}

/** 与编辑器一致：宁可少认，也不把 "$5 和 $10" 当成公式 */
function mathInlineRule(state: StateInline, silent: boolean): boolean {
  if (state.src.charCodeAt(state.pos) !== 0x24) return false
  if (state.src.charCodeAt(state.pos + 1) === 0x24) return false
  const first = state.src.charCodeAt(state.pos + 1)
  if (!Number.isFinite(first) || first === 0x20 || first === 0x09) return false

  for (let pos = state.pos + 1; pos < state.posMax; pos += 1) {
    const code = state.src.charCodeAt(pos)
    if (code === 0x0a) return false
    if (code !== 0x24) continue

    let backslashes = 0
    for (let k = pos - 1; k > state.pos && state.src.charCodeAt(k) === 0x5c; k -= 1) {
      backslashes += 1
    }
    if (backslashes % 2 === 1) continue

    const prev = state.src.charCodeAt(pos - 1)
    if (prev === 0x20 || prev === 0x09) return false
    const next = state.src.charCodeAt(pos + 1)
    if (next >= 0x30 && next <= 0x39) return false

    const tex = state.src.slice(state.pos + 1, pos)
    if (!tex.trim()) return false
    if (!silent) {
      const token = state.push('math_inline', 'math', 0)
      token.content = tex
      token.markup = '$'
    }
    state.pos = pos + 1
    return true
  }
  return false
}

function wikiLinkRule(state: StateInline, silent: boolean): boolean {
  if (state.src.charCodeAt(state.pos) !== 0x5b) return false
  if (state.src.charCodeAt(state.pos + 1) !== 0x5b) return false
  const end = state.src.indexOf(']]', state.pos + 2)
  if (end < 0) return false
  const inner = state.src.slice(state.pos + 2, end)
  if (!inner || inner.includes('\n') || inner.includes('[[')) return false
  if (!silent) {
    const token = state.push('wiki_link', 'span', 0)
    token.content = inner
    token.markup = '[[]]'
  }
  state.pos = end + 2
  return true
}

function headingAnchors(md: MarkdownItInstance): void {
  md.core.ruler.push('export_heading_anchors', (state: StateCore) => {
    const env = state.env as ExportEnv
    const headings: ExportTocEntry[] = []
    const used = new Map<string, number>()

    for (let i = 0; i < state.tokens.length; i += 1) {
      const token = state.tokens[i]
      if (token.type !== 'heading_open') continue
      const inline = state.tokens[i + 1]
      const text = plainText(inline)
      const id = uniqueId(slugifyHeading(text), used)
      token.attrSet('id', id)
      headings.push({ level: Number(token.tag.slice(1)) || 1, text, id })
    }

    env.headings = headings
  })
}

function renderToc(headings: ExportTocEntry[]): string {
  if (headings.length === 0) return ''

  interface Node {
    entry: ExportTocEntry
    children: Node[]
  }
  const root: Node[] = []
  const stack: Array<{ level: number; children: Node[] }> = [{ level: 0, children: root }]

  for (const heading of headings) {
    while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) stack.pop()
    const node: Node = { entry: heading, children: [] }
    stack[stack.length - 1].children.push(node)
    stack.push({ level: heading.level, children: node.children })
  }

  const escape = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const renderNodes = (nodes: Node[]): string =>
    `<ul>${nodes
      .map(
        (node) =>
          `<li><a href="#${escape(node.entry.id)}">${escape(node.entry.text)}</a>${
            node.children.length ? renderNodes(node.children) : ''
          }</li>`
      )
      .join('')}</ul>`

  return `<nav class="md-toc">${renderNodes(root)}</nav>\n`
}

/** 主渲染入口：Markdown → 一段可嵌入完整文档的 HTML */
export async function renderMarkdown(
  markdown: string,
  options: RenderMarkdownOptions
): Promise<RenderMarkdownResult> {
  const { body, data } = splitFrontMatter(markdown)
  const extracted = extractMermaid(body)
  const md = createExportMarkdown()
  const env: ExportEnv = { docPath: options.docPath ?? '' }

  let html = md.render(extracted.markdown, env)
  const rendered = await Promise.all(
    extracted.blocks.map(async (source) => {
      try {
        const renderer = options.mermaidRenderer ?? ((code: string) => renderMermaid(code, options.dark))
        const svg = await renderer(source)
        return `<figure class="md-mermaid" data-export-raster="mermaid">${svg}</figure>`
      } catch (error) {
        return `<div class="md-mermaid-error" data-export-raster="mermaid">${md.utils.escapeHtml(
          String(error instanceof Error ? error.message : error)
        )}</div>`
      }
    })
  )

  html = html.replace(
    /<div class="inkdown-mermaid-placeholder" data-mermaid-index="(\d+)"><\/div>/g,
    (_match, index: string) => rendered[Number(index)] ?? ''
  )

  const headings = env.headings ?? []
  html = html.replace(/<p>\s*\[toc\]\s*<\/p>/gi, renderToc(headings))
  html = html.replace(/<p>\s*\\pagebreak\s*<\/p>/gi, '<div class="md-page-break"></div>')

  const title =
    data.title ||
    headings.find((heading) => heading.level === 1)?.text ||
    options.titleFallback ||
    'Untitled'

  return {
    html,
    title,
    author: data.author ?? data.creator ?? null,
    frontMatter: data,
    toc: headings,
    mermaidCount: extracted.blocks.length
  }
}

/** 供 LaTeX 导出复用同一套语法（不渲染 HTML） */
export function createExportMarkdown(): MarkdownItInstance {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    xhtmlOut: true
  })

  md.use(footnote)
  md.use(taskLists, { enabled: true, label: true })
  md.use(mark)
  md.use(sub)
  md.use(sup)
  md.use(emoji)

  md.block.ruler.before('fence', 'export_math_block', mathBlockRule)
  md.inline.ruler.after('backticks', 'export_math_inline', mathInlineRule)
  md.inline.ruler.before('link', 'export_wiki_link', wikiLinkRule)

  headingAnchors(md)

  const defaultImage = md.renderer.rules.image
  md.renderer.rules.image = (tokens, idx, opts, env, self) => {
    const docPath = (env as ExportEnv).docPath ?? ''
    const token = tokens[idx]
    const raw = String(token.attrGet('src') ?? '')
    const resolved = docPath ? resolveImageSrc(raw, docPath) : raw
    if (resolved) token.attrSet('src', resolved)
    return defaultImage ? defaultImage(tokens, idx, opts, env, self) : self.renderToken(tokens, idx, opts)
  }

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    const info = token.info.trim()
    const lang = info.split(/\s+/)[0] ?? ''

    if (/^math$/i.test(lang)) {
      return `<div class="md-math-block" data-export-raster="math">${renderMath(
        token.content.trim(),
        true,
        md.utils.escapeHtml
      )}</div>\n`
    }

    let highlighted = ''
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlighted = hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value
      } catch {
        highlighted = ''
      }
    } else if (token.content.trim()) {
      try {
        highlighted = hljs.highlightAuto(token.content).value
      } catch {
        highlighted = ''
      }
    }
    if (!highlighted) highlighted = md.utils.escapeHtml(token.content)

    const cls = lang ? ` language-${md.utils.escapeHtml(lang)}` : ''
    return `<pre><code class="hljs${cls}">${highlighted}</code></pre>\n`
  }

  md.renderer.rules.math_inline = (tokens, idx) => {
    const token = tokens[idx]
    return `<span class="md-math" data-export-raster="math">${renderMath(
      token.content,
      false,
      md.utils.escapeHtml
    )}</span>`
  }

  md.renderer.rules.math_block = (tokens, idx) => {
    const token = tokens[idx]
    return `<div class="md-math-block" data-export-raster="math">${renderMath(
      token.content,
      true,
      md.utils.escapeHtml
    )}</div>\n`
  }

  md.renderer.rules.wiki_link = (tokens, idx) => {
    const token = tokens[idx]
    const [target, label] = token.content.split('|')
    const text = (label ?? target).trim() || target
    return `<span class="md-wikilink" data-wikilink="${md.utils.escapeHtml(
      target.trim()
    )}">${md.utils.escapeHtml(text)}</span>`
  }

  return md
}
