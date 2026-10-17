import { describe, expect, it } from 'vitest'
import { collectMathItems, type MathItem } from './math'

function scan(text: string, excluded: { from: number; to: number }[] = []): MathItem[] {
  return collectMathItems({
    text: { length: text.length, slice: (from, to) => text.slice(from, to) },
    from: 0,
    to: text.length,
    excluded
  })
}

function texOf(items: MathItem[]): string[] {
  return items.map((item) => item.tex)
}

describe('collectMathItems', () => {
  it('识别行内公式并保留内部空格', () => {
    const items = scan('质能方程 $E = mc^2$ 结束')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'inline', display: false })
    expect(items[0].tex).toBe('E = mc^2')
  })

  it('识别同一行多个行内公式', () => {
    expect(texOf(scan('$a$ 和 $b$'))).toEqual(['a', 'b'])
  })

  it('识别单行块级公式', () => {
    const items = scan('$$\\int_0^1 x dx$$')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'block', display: true })
    expect(items[0].tex).toBe('\\int_0^1 x dx')
  })

  it('识别跨行块级公式并裁剪首尾空白', () => {
    const text = '$$\n\\int_0^1 x\\,dx = \\frac{1}{3}\n$$'
    const items = scan(text)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'block', display: true })
    expect(items[0].tex).toBe('\\int_0^1 x\\,dx = \\frac{1}{3}')
    expect(items[0].from).toBe(0)
    expect(items[0].to).toBe(text.length)
  })

  it('货币写法不会被误判', () => {
    expect(scan('$5 和 $10')).toHaveLength(0)
    expect(scan('价格 $5，另一件 $10 元')).toHaveLength(0)
  })

  it('行内公式不跨行', () => {
    expect(scan('$a\nb$')).toHaveLength(0)
  })

  it('开闭 $ 紧邻空白时不算公式', () => {
    expect(scan('$ x$')).toHaveLength(0)
    expect(scan('$x $')).toHaveLength(0)
  })

  it('转义的美元符号被跳过', () => {
    expect(scan('\\$x$')).toHaveLength(0)
    expect(scan('$a \\$ b$')[0]?.tex).toBe('a \\$ b')
  })

  it('排除代码与链接区间', () => {
    const text = '`$a$` 与 [链接](https://x.com/$b$)'
    const excluded = [
      { from: 0, to: 5 },
      { from: 9, to: text.length }
    ]
    expect(scan(text, excluded)).toHaveLength(0)
  })

  it('块公式内部的 $ 不被当成行内公式', () => {
    const items = scan('$$\na + b\n$$')
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('block')
  })
})
