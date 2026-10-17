import { describe, expect, it } from 'vitest'
import { parseOutline } from './outline'

describe('parseOutline', () => {
  it('解析 ATX 标题层级与行首偏移', () => {
    const text = '# 一级\n## 二级\n正文\n'
    const items = parseOutline(text)
    expect(items.map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 1, text: '一级' },
      { level: 2, text: '二级' }
    ])
    expect(items[1].from).toBe(5)
  })

  it('去掉闭合井号与常见行内标记', () => {
    const items = parseOutline('### **粗体** `代码` ##\n')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ level: 3, text: '粗体 代码' })
  })

  it('忽略围栏代码块里的井号行', () => {
    const text = '# 真标题\n```md\n# 假标题\n```\n## 另一个\n'
    expect(parseOutline(text).map((item) => item.text)).toEqual(['真标题', '另一个'])
  })

  it('识别 Setext 标题', () => {
    const text = '一级\n===\n\n二级\n---\n'
    const items = parseOutline(text)
    expect(items.map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 1, text: '一级' },
      { level: 2, text: '二级' }
    ])
  })

  it('四空格缩进的行不算标题', () => {
    expect(parseOutline('    # 缩进代码\n')).toHaveLength(0)
  })

  it('CRLF 文档的偏移仍然指向行首', () => {
    const text = 'a\r\n# 标题\r\n'
    const [item] = parseOutline(text)
    expect(text.slice(item.from, item.from + 4)).toBe('# 标题')
  })
})
