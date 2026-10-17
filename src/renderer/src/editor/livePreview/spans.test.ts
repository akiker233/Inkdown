import { GFM, parser } from '@lezer/markdown'
import { describe, expect, it } from 'vitest'
import {
  buildDecorationSpecs,
  collectInlineSpans,
  isSpanActive,
  sourceOf,
  type InlineSpan
} from './spans'

const md = parser.configure(GFM)

function scan(text: string, from = 0, to = text.length): InlineSpan[] {
  return collectInlineSpans({ tree: md.parse(text), text: sourceOf(text), from, to })
}

function spansOfKind(text: string, kind: InlineSpan['kind']): InlineSpan[] {
  return scan(text).filter((span) => span.kind === kind)
}

function slice(text: string, range: { from: number; to: number }): string {
  return text.slice(range.from, range.to)
}

describe('collectInlineSpans', () => {
  it('隐藏粗体、斜体、删除线的标记但保留内容', () => {
    const text = '**粗体** *斜体* ~~删除~~'
    const bold = spansOfKind(text, 'strong')[0]
    const italic = spansOfKind(text, 'em')[0]
    const strike = spansOfKind(text, 'strike')[0]

    expect(bold.markers.map((m) => slice(text, m))).toEqual(['**', '**'])
    expect(slice(text, bold.content)).toBe('粗体')
    expect(italic.markers.map((m) => slice(text, m))).toEqual(['*', '*'])
    expect(slice(text, italic.content)).toBe('斜体')
    expect(strike.markers.map((m) => slice(text, m))).toEqual(['~~', '~~'])
    expect(slice(text, strike.content)).toBe('删除')
  })

  it('嵌套强调各自产生 span', () => {
    const text = '**a *b* c**'
    expect(spansOfKind(text, 'strong')).toHaveLength(1)
    const em = spansOfKind(text, 'em')[0]
    expect(slice(text, em.content)).toBe('b')
  })

  it('行内代码隐藏反引号，且代码内的 == 不再高亮', () => {
    const text = '`==not mark==`'
    expect(spansOfKind(text, 'code')).toHaveLength(1)
    expect(spansOfKind(text, 'highlight')).toHaveLength(0)
    const code = spansOfKind(text, 'code')[0]
    expect(code.markers.map((m) => slice(text, m))).toEqual(['`', '`'])
    expect(slice(text, code.content)).toBe('==not mark==')
  })

  it('行内链接隐藏 ](url)，保留 label', () => {
    const text = '[label](https://x.com)'
    const link = spansOfKind(text, 'link')[0]
    expect(link.markers.map((m) => slice(text, m))).toEqual(['[', '](https://x.com)'])
    expect(slice(text, link.content)).toBe('label')
  })

  it('自动链接隐藏尖括号', () => {
    const text = '<https://a.b>'
    const auto = spansOfKind(text, 'autolink')[0]
    expect(auto.markers.map((m) => slice(text, m))).toEqual(['<', '>'])
    expect(slice(text, auto.content)).toBe('https://a.b')
  })

  it('Wiki 链接显示别名并隐藏两层方括号', () => {
    const text = '[[target|显示文字]]'
    const wiki = spansOfKind(text, 'wiki')[0]
    expect(wiki.from).toBe(0)
    expect(wiki.to).toBe(text.length)
    expect(wiki.markers.map((m) => slice(text, m))).toEqual(['[[target|', ']]'])
    expect(slice(text, wiki.content)).toBe('显示文字')
  })

  it('无别名的 Wiki 链接直接显示目标', () => {
    const text = '[[wiki]]'
    const wiki = spansOfKind(text, 'wiki')[0]
    expect(wiki.markers.map((m) => slice(text, m))).toEqual(['[[', ']]'])
    expect(slice(text, wiki.content)).toBe('wiki')
  })

  it('高亮隐藏 == 并套 md-mark', () => {
    const text = '前 ==高亮== 后'
    const mark = spansOfKind(text, 'highlight')[0]
    expect(mark.className).toBe('md-mark')
    expect(mark.markers.map((m) => slice(text, m))).toEqual(['==', '=='])
    expect(slice(text, mark.content)).toBe('高亮')
  })

  it('转义的 == 不产生高亮', () => {
    expect(spansOfKind('\\==x==', 'highlight')).toHaveLength(0)
  })

  it('代码块内不扫描行内语法', () => {
    const text = '```\n**bold** ==mark==\n```'
    expect(spansOfKind(text, 'strong')).toHaveLength(0)
    expect(spansOfKind(text, 'highlight')).toHaveLength(0)
  })

  it('只处理传入的视口范围', () => {
    const text = 'first **a**\n\nsecond **b**'
    const second = text.indexOf('second')
    const spans = scan(text, second, text.length)
    const strong = spans.filter((s) => s.kind === 'strong')
    expect(strong).toHaveLength(1)
    expect(slice(text, strong[0].content)).toBe('b')
  })

  it('中文与强调符号混排', () => {
    const text = '你好 **世界**，==高亮==！'
    expect(slice(text, spansOfKind(text, 'strong')[0].content)).toBe('世界')
    expect(slice(text, spansOfKind(text, 'highlight')[0].content)).toBe('高亮')
  })
})

describe('buildDecorationSpecs', () => {
  const text = '**bold**'
  const span = spansOfKind(text, 'strong')[0]

  it('光标在结构内部时露出源码标记，但仍保留内容样式', () => {
    const selection = [{ from: 3, to: 3 }]
    expect(isSpanActive(span, selection)).toBe(true)

    const { decorations, atomic } = buildDecorationSpecs([span], selection)
    expect(decorations.filter((d) => d.kind === 'replace')).toHaveLength(0)
    expect(decorations.filter((d) => d.kind === 'mark')).toHaveLength(1)
    expect(atomic).toHaveLength(0)
  })

  it('光标在结构外时隐藏标记，atomic 只包含 replace 区间', () => {
    const { decorations, atomic } = buildDecorationSpecs([span], [{ from: 20, to: 20 }])
    const replace = decorations.filter((d) => d.kind === 'replace')
    expect(replace).toHaveLength(2)
    expect(atomic).toEqual(replace.map(({ from, to }) => ({ from, to })))
    expect(atomic).not.toContainEqual({ from: span.content.from, to: span.content.to })
  })

  it('光标停在结构边界外时不激活', () => {
    expect(isSpanActive(span, [{ from: span.from, to: span.from }])).toBe(false)
    expect(isSpanActive(span, [{ from: span.to, to: span.to }])).toBe(false)
  })
})
