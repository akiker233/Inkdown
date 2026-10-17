import type { Token } from 'markdown-it'
import {
  createExportMarkdown,
  splitFrontMatter
} from './markdown'
import { resolveLocalImagePath } from '../editor/livePreview/imageSrc'

export interface LatexOptions {
  title: string
  author: string | null
  docPath: string | null
  language: 'zh' | 'en'
}

interface InlineContext {
  docPath: string | null
  footnotes: Map<number, string>
}

const ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\textasciicircum{}',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}'
}

export function escapeLatex(text: string): string {
  return text.replace(/[\\{}$&#^_%~]/g, (char) => ESCAPES[char] ?? char)
}

function escapeUrl(url: string): string {
  return url.replace(/([%#&])/g, '\\$1')
}

function inlineToLatex(tokens: Token[] | null, context: InlineContext): string {
  if (!tokens) return ''
  const closers: string[] = []
  let out = ''

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        out += escapeLatex(token.content)
        break
      case 'code_inline':
        out += `\\texttt{${escapeLatex(token.content)}}`
        break
      case 'strong_open':
        out += '\\textbf{'
        closers.push('}')
        break
      case 'em_open':
        out += '\\emph{'
        closers.push('}')
        break
      case 's_open':
        out += '\\sout{'
        closers.push('}')
        break
      case 'mark_open':
        out += '\\hl{'
        closers.push('}')
        break
      case 'sub_open':
        out += '\\textsubscript{'
        closers.push('}')
        break
      case 'sup_open':
        out += '\\textsuperscript{'
        closers.push('}')
        break
      case 'strong_close':
      case 'em_close':
      case 's_close':
      case 'mark_close':
      case 'sub_close':
      case 'sup_close':
      case 'link_close':
        out += closers.pop() ?? ''
        break
      case 'link_open': {
        const href = String(token.attrGet('href') ?? '')
        out += `\\href{${escapeUrl(href)}}{`
        closers.push('}')
        break
      }
      case 'image': {
        const src = String(token.attrGet('src') ?? '')
        const local = context.docPath ? resolveLocalImagePath(src, context.docPath) : null
        const alt = token.content || 'image'
        if (local) {
          out += `\\includegraphics[width=\\linewidth,height=0.8\\textheight,keepaspectratio]{\\detokenize{${local.replace(
            /\\/g,
            '/'
          )}}}`
        } else {
          out += `\\textit{[${escapeLatex(alt)}]}`
        }
        break
      }
      case 'softbreak':
        out += ' '
        break
      case 'hardbreak':
        out += '\\\\\n'
        break
      case 'math_inline':
        out += `$${token.content}$`
        break
      case 'footnote_ref': {
        const id = (token.meta as { id?: number } | null)?.id ?? -1
        out += `\\footnote{${context.footnotes.get(id) ?? ''}}`
        break
      }
      case 'emoji':
        out += token.content
        break
      case 'html_inline': {
        const html = token.content
        if (html.includes('task-list-item-checkbox')) {
          out += html.includes('checked') ? '$\\boxtimes$ ' : '$\\square$ '
        } else if (/^<br\s*\/?>$/i.test(html)) {
          out += '\\\\\n'
        }
        break
      }
      case 'wiki_link': {
        const [, label] = token.content.split('|')
        out += escapeLatex((label ?? token.content).trim())
        break
      }
      default:
        if (token.content) out += escapeLatex(token.content)
        break
    }
  }

  while (closers.length > 0) out += closers.pop() ?? ''
  return out
}

function collectFootnotes(tokens: Token[], context: InlineContext): void {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token.type !== 'footnote_open') continue
    const id = (token.meta as { id?: number } | null)?.id ?? -1
    const saved = context.footnotes
    context.footnotes = new Map()

    // 脚注正文包在 paragraph_open / inline 里，取到 footnote_close 为止
    const parts: string[] = []
    let end = i + 1
    for (; end < tokens.length && tokens[end].type !== 'footnote_close'; end += 1) {
      if (tokens[end].type === 'inline') {
        parts.push(inlineToLatex(tokens[end].children, context))
      }
    }

    context.footnotes = saved
    context.footnotes.set(id, parts.join('\n\n'))
    i = end
  }
}

function tableToLatex(tokens: Token[], start: number, context: InlineContext): { latex: string; next: number } {
  const rows: string[][] = []
  let align = ''
  let currentRow: string[] | null = null
  let i = start

  for (; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token.type === 'table_close') break
    if (token.type === 'tr_open') currentRow = []
    else if (token.type === 'tr_close') {
      if (currentRow) rows.push(currentRow)
      currentRow = null
    } else if (token.type === 'th_open' || token.type === 'td_open') {
      const style = String(token.attrGet('style') ?? '')
      if (token.type === 'th_open' && align.length < 64) {
        align += style.includes('center') ? 'c' : style.includes('right') ? 'r' : 'l'
      }
      const inline = tokens[i + 1]?.type === 'inline' ? tokens[i + 1] : null
      const cell = inlineToLatex(inline?.children ?? null, context)
      currentRow?.push(token.type === 'th_open' ? `\\textbf{${cell}}` : cell)
    }
  }

  const columns = align || 'l'.repeat(rows[0]?.length ?? 1)
  const header = rows.length > 1 ? `\\toprule\n${rows[0].join(' & ')} \\\\\n\\midrule\n` : ''
  const dataRows = rows.length > 1 ? rows.slice(1) : rows
  const data = dataRows
    .map((row) => row.map((cell) => cell || '').join(' & ') + ' \\\\')
    .join('\n')

  return {
    latex: `\\begin{longtable}{${columns}}\n${header}${data}\n\\bottomrule\n\\end{longtable}\n\n`,
    next: i
  }
}

export function markdownToLatex(markdown: string, options: LatexOptions): string {
  const { body } = splitFrontMatter(markdown)
  const md = createExportMarkdown()
  const tokens = md.parse(body, {})
  const context: InlineContext = { docPath: options.docPath, footnotes: new Map() }
  collectFootnotes(tokens, context)

  const blocks: string[] = []
  let inFootnotes = false

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]

    if (token.type === 'footnote_block_open') {
      inFootnotes = true
      continue
    }
    if (inFootnotes) continue

    switch (token.type) {
      case 'heading_open': {
        const level = Number(token.tag.slice(1)) || 1
        const command = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'subparagraph'][
          Math.min(level, 6) - 1
        ]
        const inline = tokens[i + 1]?.type === 'inline' ? tokens[i + 1] : null
        blocks.push(`\\${command}{${inlineToLatex(inline?.children ?? null, context)}}\n`)
        if (inline) i += 1
        break
      }
      case 'paragraph_open': {
        const inline = tokens[i + 1]?.type === 'inline' ? tokens[i + 1] : null
        const raw = inline?.content.trim() ?? ''
        if (/^\[toc\]$/i.test(raw)) {
          blocks.push('\\tableofcontents\n\\newpage\n')
        } else if (/^\\pagebreak$/i.test(raw)) {
          blocks.push('\\newpage\n')
        } else {
          const text = inlineToLatex(inline?.children ?? null, context)
          if (text.trim()) blocks.push(`${text}\n\n`)
        }
        if (inline) i += 1
        break
      }
      case 'inline':
        blocks.push(`${inlineToLatex(token.children, context)}\n\n`)
        break
      case 'bullet_list_open':
        blocks.push('\\begin{itemize}\n')
        break
      case 'bullet_list_close':
        blocks.push('\\end{itemize}\n\n')
        break
      case 'ordered_list_open':
        blocks.push('\\begin{enumerate}\n')
        break
      case 'ordered_list_close':
        blocks.push('\\end{enumerate}\n\n')
        break
      case 'list_item_open':
        blocks.push('\\item ')
        break
      case 'list_item_close':
        blocks.push('\n')
        break
      case 'blockquote_open':
        blocks.push('\\begin{quote}\n')
        break
      case 'blockquote_close':
        blocks.push('\\end{quote}\n\n')
        break
      case 'fence':
      case 'code_block': {
        const info = token.info.trim()
        const lang = info.split(/\s+/)[0] ?? ''
        if (lang.toLowerCase() === 'mermaid') {
          blocks.push('% Mermaid 图表需要在 Inkdown 中导出为图片\n')
          break
        }
        if (lang.toLowerCase() === 'math') {
          blocks.push(`\\[\n${token.content.trim()}\n\\]\n\n`)
          break
        }
        blocks.push(`\\begin{verbatim}\n${token.content.replace(/\\end\{verbatim\}/g, '\\end {verbatim}')}\\end{verbatim}\n\n`)
        break
      }
      case 'hr':
        blocks.push('\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par\n\n')
        break
      case 'math_block':
        blocks.push(`\\[\n${token.content}\n\\]\n\n`)
        break
      case 'table_open': {
        const table = tableToLatex(tokens, i, context)
        blocks.push(table.latex)
        i = table.next
        break
      }
      case 'html_block': {
        if (/page-break|pagebreak/i.test(token.content)) {
          blocks.push('\\newpage\n')
        } else if (/^<br\s*\/?>$/i.test(token.content.trim())) {
          blocks.push('\\\\\n')
        }
        break
      }
      default:
        break
    }
  }

  const cjk = /[\u3400-\u9fff\uf900-\ufaff]/.test(markdown)
  const documentClass = cjk
    ? '% 中文文档请使用 XeLaTeX 编译\n\\documentclass[UTF8,11pt]{ctexart}'
    : '\\documentclass[11pt]{article}'

  const title = escapeLatex(options.title)
  const author = options.author ? escapeLatex(options.author) : ''
  const preamble = [
    documentClass,
    '\\usepackage[a4paper,margin=2.5cm]{geometry}',
    '\\usepackage{graphicx}',
    '\\usepackage{xcolor}',
    '\\usepackage[normalem]{ulem}',
    '\\usepackage{soul}',
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage{longtable,booktabs,array}',
    '\\usepackage[hidelinks]{hyperref}',
    '\\usepackage{verbatim}',
    '\\setlength{\\parindent}{0pt}',
    '\\setlength{\\parskip}{0.55em}',
    '\\title{' + title + '}',
    author ? `\\author{${author}}` : '\\author{}',
    '\\date{}',
    '\\begin{document}',
    '\\maketitle'
  ].join('\n')

  return `${preamble}\n\n${blocks.join('').trim()}\n\n\\end{document}\n`
}
