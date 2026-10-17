import { describe, expect, it } from 'vitest'
import { analyzeText } from './stats'

describe('analyzeText', () => {
  it('中文按字、英文按词统计', () => {
    const stats = analyzeText('你好 world 123')
    expect(stats.cjk).toBe(2)
    expect(stats.latin).toBe(2)
    expect(stats.words).toBe(4)
    expect(stats.chars).toBe(12)
    expect(stats.charsNoSpaces).toBe(10)
  })

  it('空文档仍有 1 行、无段落', () => {
    const stats = analyzeText('')
    expect(stats.words).toBe(0)
    expect(stats.lines).toBe(1)
    expect(stats.paragraphs).toBe(0)
    expect(stats.readingMinutes).toBe(0)
  })

  it('按空行划分段落', () => {
    expect(analyzeText('a\n\nb\n\n\nc').paragraphs).toBe(3)
    expect(analyzeText('a\nb\nc').paragraphs).toBe(1)
  })

  it('字符数按码点计算，emoji 不被拆成两个', () => {
    const stats = analyzeText('😀')
    expect(stats.chars).toBe(1)
    expect(stats.charsNoSpaces).toBe(1)
  })

  it('阅读时间按每分钟 300 字向上取整', () => {
    expect(analyzeText('a '.repeat(300)).readingMinutes).toBe(1)
    expect(analyzeText('a '.repeat(301)).readingMinutes).toBe(2)
  })
})
