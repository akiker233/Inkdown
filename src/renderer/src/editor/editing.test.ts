import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { headingFoldRange, listContinuation } from './editing'

describe('listContinuation', () => {
  it('续写无序列表', () => {
    expect(listContinuation('- one')).toEqual({
      contentStart: 2,
      insert: '\n- ',
      empty: false
    })
  })

  it('保留缩进与任务标记', () => {
    expect(listContinuation('  - [x] done')).toEqual({
      contentStart: 8,
      insert: '\n  - [ ] ',
      empty: false
    })
  })

  it('有序列表序号递增', () => {
    expect(listContinuation('1. first')?.insert).toBe('\n2. ')
    expect(listContinuation('12) item')?.insert).toBe('\n13) ')
  })

  it('空条目返回退出信号', () => {
    expect(listContinuation('- ')).toEqual({ contentStart: 2, insert: '', empty: true })
    expect(listContinuation('  1. [ ] ')).toEqual({
      contentStart: 9,
      insert: '',
      empty: true
    })
  })

  it('普通段落不处理', () => {
    expect(listContinuation('hello')).toBeNull()
    expect(listContinuation('> - quote')).toBeNull()
  })
})

describe('headingFoldRange', () => {
  const doc = Text.of(['# A', 'x', '## B', 'y', '# C', 'z'])

  it('折叠到下一个同级或更高级标题之前', () => {
    expect(headingFoldRange(doc, 0)).toEqual({ from: 3, to: 12 })
  })

  it('子标题只折叠自己的正文', () => {
    expect(headingFoldRange(doc, 6)).toEqual({ from: 10, to: 12 })
  })

  it('末尾标题折叠剩余正文', () => {
    expect(headingFoldRange(doc, 13)).toEqual({ from: 16, to: 18 })
  })

  it('无正文或非标题返回 null', () => {
    expect(headingFoldRange(Text.of(['# A']), 0)).toBeNull()
    expect(headingFoldRange(doc, 4)).toBeNull()
  })
})
