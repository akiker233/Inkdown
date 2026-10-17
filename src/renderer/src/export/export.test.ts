import { describe, expect, it } from 'vitest'
import { buildExportHtml } from './html'
import { markdownToLatex } from './latex'
import { renderMarkdown, slugifyHeading, splitFrontMatter } from './markdown'

const docPath = 'D:/docs/note.md'
const mermaidRenderer = async (source: string): Promise<string> =>
  `<svg class="fake-mermaid" data-source="${source.length}"></svg>`

describe('splitFrontMatter', () => {
  it('读取文档开头的 YAML 字段并从正文剥离', () => {
    const result = splitFrontMatter('---\ntitle: Hello\nauthor: Ada\n---\n# Body\n')
    expect(result.data).toEqual({ title: 'Hello', author: 'Ada' })
    expect(result.body.trim()).toBe('# Body')
  })

  it('不会把正文里的分隔线当成 front matter', () => {
    const source = '# Title\n\n---\n\ncontent'
    const result = splitFrontMatter(source)
    expect(result.data).toEqual({})
    expect(result.body).toContain('---')
  })
})

describe('slugifyHeading', () => {
  it('保留中文并折叠空白', () => {
    expect(slugifyHeading('导出 与 打印')).toBe('导出-与-打印')
  })

  it('去掉 Markdown 标记并给空标题兜底', () => {
    expect(slugifyHeading('**Bold** `code`')).toBe('bold-code')
    expect(slugifyHeading('***')).toBe('section')
  })
})

describe('renderMarkdown', () => {
  it('生成标题锚点与嵌套 TOC', async () => {
    const rendered = await renderMarkdown('# 标题\n\n## 子标题\n\n[TOC]\n', {
      docPath,
      dark: false
    })
    expect(rendered.toc.map((entry) => entry.id)).toEqual(['标题', '子标题'])
    expect(rendered.html).toContain('id="标题"')
    expect(rendered.html).toContain('<nav class="md-toc">')
    expect(rendered.html).toContain('href="#子标题"')
  })

  it('重复标题生成唯一 id', async () => {
    const rendered = await renderMarkdown('# Same\n\n# Same\n', { docPath, dark: false })
    expect(rendered.toc.map((entry) => entry.id)).toEqual(['same', 'same-1'])
  })

  it('渲染行内与块级公式为 MathML', async () => {
    const rendered = await renderMarkdown(
      'Inline $E = mc^2$.\n\n$$\n\\int_0^1 x\\,dx\n$$\n\n```math\n\\sum_{i=1}^n i\n```\n',
      { docPath, dark: false }
    )
    expect(rendered.html).toContain('<math')
    expect(rendered.html).toContain('data-export-raster="math"')
    expect(rendered.html).not.toContain('```')
  })

  it('代码围栏带语言高亮', async () => {
    const rendered = await renderMarkdown('```ts\nconst answer: number = 42\n```\n', {
      docPath,
      dark: false
    })
    expect(rendered.html).toContain('class="hljs language-ts"')
    expect(rendered.html).toContain('hljs-keyword')
  })

  it('Mermaid 占位块由异步渲染器回填', async () => {
    const rendered = await renderMarkdown('```mermaid\nflowchart LR\n A-->B\n```\n', {
      docPath,
      dark: false,
      mermaidRenderer
    })
    expect(rendered.mermaidCount).toBe(1)
    expect(rendered.html).toContain('fake-mermaid')
    expect(rendered.html).toContain('data-export-raster="mermaid"')
    expect(rendered.html).not.toContain('inkdown-mermaid-placeholder')
  })

  it('本地图片转为自建资源协议，远程图片保持原样', async () => {
    const rendered = await renderMarkdown(
      '![local](assets/pic.png)\n\n![remote](https://example.com/a.png)\n',
      { docPath, dark: false }
    )
    expect(rendered.html).toContain('inkdown-asset://local/D%3A/docs/assets/pic.png')
    expect(rendered.html).toContain('src="https://example.com/a.png"')
  })

  it('处理 \\pagebreak 与脚注', async () => {
    const rendered = await renderMarkdown(
      'a\n\n\\pagebreak\n\nb\n\nfoot[^1]\n\n[^1]: note\n',
      { docPath, dark: true }
    )
    expect(rendered.html).toContain('md-page-break')
    expect(rendered.html).toContain('footnote-ref')
    expect(rendered.html).toContain('footnote-backref')
  })
})

describe('buildExportHtml', () => {
  it('产出带主题与内联样式的完整文档', async () => {
    const rendered = await renderMarkdown('# Title\n\nBody **bold**\n', {
      docPath,
      dark: true
    })
    const html = buildExportHtml(rendered, { dark: true, language: 'zh' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('data-theme="dark"')
    expect(html).toContain('lang="zh-CN"')
    expect(html).toContain('--bg-color')
    expect(html).toContain('class="markdown-body export-body"')
    expect(html).toContain('<strong>bold</strong>')
  })
})

describe('markdownToLatex', () => {
  const options = {
    title: '测试',
    author: 'Ada',
    docPath,
    language: 'zh' as const
  }

  it('中文文档使用 ctexart 并转义特殊字符', () => {
    const tex = markdownToLatex('# 标题\n\n100% & $5\n', options)
    expect(tex).toContain('\\documentclass[UTF8,11pt]{ctexart}')
    expect(tex).toContain('100\\% \\& \\$5')
    expect(tex).toContain('\\section{标题}')
  })

  it('处理公式、表格、脚注与 math 围栏', () => {
    const source = [
      'Inline $x^2$',
      '',
      '$$',
      'a + b',
      '$$',
      '',
      '```math',
      '\\sum_i i',
      '```',
      '',
      '| A | B |',
      '| :- | -: |',
      '| 1 | 2 |',
      '',
      'note[^1]',
      '',
      '[^1]: body'
    ].join('\n')
    const tex = markdownToLatex(source, options)
    expect(tex).toContain('$x^2$')
    expect(tex).toContain('\\[\na + b\n\\]')
    expect(tex).toContain('\\[\n\\sum_i i\n\\]')
    expect(tex).not.toContain('\\begin{verbatim}\n\\sum_i i')
    expect(tex).toContain('\\begin{longtable}')
    expect(tex).toContain('\\footnote{body}')
  })

  it('Mermaid 只留占位注释，不输出源码', () => {
    const tex = markdownToLatex('```mermaid\nflowchart LR\n A-->B\n```\n', options)
    expect(tex).toContain('% Mermaid')
    expect(tex).not.toContain('flowchart LR')
  })

  it('本地图片走 includegraphics', () => {
    const tex = markdownToLatex('![x](assets/pic.png)\n', options)
    expect(tex).toContain('\\includegraphics')
    expect(tex).toContain('D:/docs/assets/pic.png')
  })
})
