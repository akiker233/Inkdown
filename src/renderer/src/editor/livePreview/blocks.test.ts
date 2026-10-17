import { GFM, parser } from '@lezer/markdown'
import { describe, expect, it } from 'vitest'
import {
  collectBlockDecorations,
  isRegionActive,
  type BlockDecoration,
  type BlockWidgetPayload
} from './blocks'

const md = parser.configure(GFM)

interface Parsed {
  decorations: BlockDecoration[]
  atomic: { from: number; to: number }[]
  excluded: { from: number; to: number }[]
}

function parse(
  text: string,
  selection: { from: number; to: number }[] = [],
  docPath = ''
): Parsed {
  return collectBlockDecorations({
    tree: md.parse(text),
    text: { length: text.length, slice: (from, to) => text.slice(from, to) },
    from: 0,
    to: text.length,
    selection,
    docPath
  })
}

function classesOf(result: Parsed): Map<number, string[]> {
  const map = new Map<number, string[]>()
  for (const spec of result.decorations) {
    if (spec.kind !== 'line') continue
    map.set(spec.from, [...(map.get(spec.from) ?? []), spec.className ?? ''])
  }
  return map
}

function lineClass(result: Parsed, pos: number): string {
  return (classesOf(result).get(pos) ?? []).join(' ')
}

function lineStartOf(text: string, pos: number): number {
  return text.lastIndexOf('\n', pos - 1) + 1
}

function widgetsOf(result: Parsed, kind: BlockWidgetPayload['kind']): BlockWidgetPayload[] {
  return result.decorations
    .filter((spec) => spec.widget?.kind === kind)
    .map((spec) => spec.widget as BlockWidgetPayload)
}

function replacedText(text: string, result: Parsed): string[] {
  return result.decorations
    .filter((spec) => spec.kind === 'replace')
    .map((spec) => text.slice(spec.from, spec.to))
}

describe('isRegionActive', () => {
  it('折叠光标落在端点上也算进入', () => {
    const region = { from: 4, to: 8 }
    expect(isRegionActive(region, [{ from: 4, to: 4 }])).toBe(true)
    expect(isRegionActive(region, [{ from: 8, to: 8 }])).toBe(true)
    expect(isRegionActive(region, [{ from: 9, to: 9 }])).toBe(false)
  })

  it('选区必须真正相交', () => {
    const region = { from: 4, to: 8 }
    expect(isRegionActive(region, [{ from: 0, to: 4 }])).toBe(false)
    expect(isRegionActive(region, [{ from: 0, to: 5 }])).toBe(true)
  })
})

describe('collectBlockDecorations', () => {
  it('ATX 标题隐藏 # 保留正文，并加行类', () => {
    const text = '## 标题'
    const result = parse(text)
    expect(lineClass(result, 0)).toContain('md-heading-line')
    expect(lineClass(result, 0)).toContain('md-h2-line')
    expect(replacedText(text, result)).toEqual(['## '])
  })

  it('Setext 标题把下划线行折叠', () => {
    const text = '标题\n====\n'
    const result = parse(text)
    expect(lineClass(result, 0)).toContain('md-h1-line')
    expect(lineClass(result, 3)).toContain('md-hidden-line')
    expect(replacedText(text, result)).toEqual(['===='])
  })

  it('标题内光标激活时保留 # 源码', () => {
    const text = '# 标题'
    const result = parse(text, [{ from: 0, to: 0 }])
    expect(replacedText(text, result)).toEqual([])
    expect(lineClass(result, 0)).toContain('md-h1-line')
  })

  it('引用逐行加 depth 类并隐藏 > 标记', () => {
    const text = '> 第一行\n> > 嵌套\n'
    const result = parse(text)
    expect(lineClass(result, 0)).toContain('md-quote-depth-1')
    expect(lineClass(result, text.indexOf('> >'))).toContain('md-quote-depth-2')
    expect(replacedText(text, result)).toEqual(['> ', '> ', '> '])
  })

  it('无序列表用圆点 widget 替换标记，并记录深度', () => {
    const text = '- 一\n  - 二\n'
    const result = parse(text)
    const bullets = widgetsOf(result, 'bullet')
    expect(bullets).toHaveLength(2)
    expect(bullets[0]).toMatchObject({ kind: 'bullet', depth: 1 })
    expect(bullets[1]).toMatchObject({ kind: 'bullet', depth: 2 })
    expect(replacedText(text, result)).toEqual(['-', '-'])
  })

  it('有序列表保留编号只加样式类', () => {
    const text = '1. 一\n2. 二\n'
    const result = parse(text)
    expect(widgetsOf(result, 'bullet')).toHaveLength(0)
    const marks = result.decorations.filter((spec) => spec.kind === 'mark')
    expect(marks.map((spec) => spec.className)).toEqual(['md-list-number', 'md-list-number'])
    expect(replacedText(text, result)).toEqual([])
  })

  it('任务列表按状态渲染复选框，有序任务保留编号', () => {
    const text = '- [ ] 未完成\n- [x] 已完成\n1. [ ] 有序\n'
    const result = parse(text)
    const tasks = widgetsOf(result, 'task')
    expect(tasks).toHaveLength(3)
    expect(tasks[0]).toMatchObject({ checked: false })
    expect(tasks[1]).toMatchObject({ checked: true })
    expect(tasks[2]).toMatchObject({ checked: false })
    expect(replacedText(text, result)).toEqual(['- [ ]', '- [x]', '[ ]'])
  })

  it('分割线整行替换为 hr widget', () => {
    const text = '---\n'
    const result = parse(text)
    expect(widgetsOf(result, 'hr')).toHaveLength(1)
    expect(replacedText(text, result)).toEqual(['---'])
  })

  it('图片替换为 image widget，相对路径基于文档路径', () => {
    const text = '![示例](../assets/a.png)'
    const result = parse(text, [], 'D:/docs/notes/a.md')
    const images = widgetsOf(result, 'image')
    expect(images).toHaveLength(1)
    expect(images[0]).toMatchObject({
      kind: 'image',
      rawSrc: '../assets/a.png',
      alt: '示例',
      src: 'inkdown-asset://local/D%3A/docs/assets/a.png'
    })
    expect(result.excluded).toHaveLength(1)
  })

  it('围栏代码块替换开围栏、给代码行加行号并折叠闭合行', () => {
    const text = '```ts\nconst a = 1\nconst b = 2\n```\n'
    const result = parse(text)
    const headers = widgetsOf(result, 'code-header')
    expect(headers).toHaveLength(1)
    expect(headers[0]).toMatchObject({ kind: 'code-header', lang: 'ts' })

    const lineNumbers = widgetsOf(result, 'code-lineno')
    expect(lineNumbers).toHaveLength(2)
    expect(lineNumbers.map((w) => (w as { number: number }).number)).toEqual([1, 2])

    const closeLine = text.indexOf('```', text.indexOf('```') + 3)
    expect(lineClass(result, closeLine)).toContain('md-hidden-line')
    expect(lineClass(result, lineStartOf(text, text.indexOf('const a')))).toContain('md-code-line')
    expect(lineClass(result, lineStartOf(text, text.indexOf('const b')))).toContain('md-code-last')
    expect(result.excluded).toHaveLength(1)
  })

  it('空围栏代码块只生成工具栏，不生成行号', () => {
    const text = '```js\n```\n'
    const result = parse(text)
    expect(widgetsOf(result, 'code-header')).toHaveLength(1)
    expect(widgetsOf(result, 'code-lineno')).toHaveLength(0)
    expect(lineClass(result, text.indexOf('```', 1))).toContain('md-hidden-line')
  })

  it('缩进代码块逐行标注并加行号', () => {
    const text = '    第一行\n    第二行\n'
    const result = parse(text)
    expect(widgetsOf(result, 'code-lineno')).toHaveLength(2)
    expect(lineClass(result, 0)).toContain('md-code-indented-first')
    expect(lineClass(result, lineStartOf(text, text.indexOf('第二行')))).toContain('md-code-last')
  })

  it('光标进入图片区间时保留 ![]() 源码', () => {
    const text = '![图](a.png)'
    const result = parse(text, [{ from: 3, to: 3 }])
    expect(widgetsOf(result, 'image')).toHaveLength(0)
    expect(replacedText(text, result)).toEqual([])
  })

  it('表格折叠为 table widget，其余行清空并折叠', () => {
    const text = '| a | b |\n| --- | ---: |\n| 1 | 2 |\n'
    const result = parse(text)
    const tables = widgetsOf(result, 'table')
    expect(tables).toHaveLength(1)
    expect(tables[0]).toMatchObject({
      kind: 'table',
      model: {
        header: ['a', 'b'],
        aligns: ['none', 'right'],
        rows: [['1', '2']]
      }
    })
    expect(lineClass(result, 0)).toContain('md-table-first')
    const secondLine = lineStartOf(text, text.indexOf('| ---'))
    expect(lineClass(result, secondLine)).toContain('md-hidden-line')
    expect(result.excluded).toHaveLength(1)
    expect(result.atomic).toHaveLength(3)
  })

  it('光标进入表格区间时保留源码', () => {
    const text = '| a | b |\n| --- | --- |\n| 1 | 2 |\n'
    const result = parse(text, [{ from: 3, to: 3 }])
    expect(widgetsOf(result, 'table')).toHaveLength(0)
    expect(replacedText(text, result)).toEqual([])
  })

  it('不合法表格退回源码，不生成 widget', () => {
    const text = '| a | b |\n| --- |\n| 1 | 2 |\n'
    const result = parse(text)
    expect(widgetsOf(result, 'table')).toHaveLength(0)
  })

  it('引用内的表格退回源码，不吞掉 > 前缀', () => {
    const text = '> | a | b |\n> | --- | --- |\n> | 1 | 2 |\n'
    const result = parse(text)
    expect(widgetsOf(result, 'table')).toHaveLength(0)
  })

  it('mermaid 围栏折叠为图表 widget，代码行全部隐藏', () => {
    const text = '```mermaid\ngraph TD\nA-->B\n```\n'
    const result = parse(text)
    const charts = widgetsOf(result, 'mermaid')
    expect(charts).toHaveLength(1)
    expect(charts[0]).toMatchObject({
      kind: 'mermaid',
      code: 'graph TD\nA-->B'
    })
    expect(lineClass(result, 0)).toContain('md-mermaid-first')
    expect(lineClass(result, lineStartOf(text, text.indexOf('graph')))).toContain(
      'md-hidden-line'
    )
    expect(widgetsOf(result, 'code-header')).toHaveLength(0)
  })

  it('光标进入 mermaid 区间时回退为代码块源码', () => {
    const text = '```mermaid\ngraph TD\nA-->B\n```\n'
    const result = parse(text, [{ from: 14, to: 14 }])
    expect(widgetsOf(result, 'mermaid')).toHaveLength(0)
    expect(widgetsOf(result, 'code-header')).toHaveLength(1)
  })

  it('未闭合的 mermaid 围栏保持代码块，不尝试渲染', () => {
    const text = '```mermaid\ngraph TD\n'
    const result = parse(text)
    expect(widgetsOf(result, 'mermaid')).toHaveLength(0)
    expect(widgetsOf(result, 'code-header')).toHaveLength(1)
  })
})
