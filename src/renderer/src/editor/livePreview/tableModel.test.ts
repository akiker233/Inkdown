import { describe, expect, it } from 'vitest'
import {
  cycleAlign,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  parseTable,
  serializeTable,
  setAlign,
  type TableModel
} from './tableModel'

function parse(source: string) {
  const parsed = parseTable(source, 0)
  if (!parsed) throw new Error(`预期解析成功: ${source}`)
  return parsed
}

describe('parseTable', () => {
  it('解析表头、表体与对齐', () => {
    const parsed = parse('| 名称 | 数量 | 备注 |\n| :--- | :---: | ---: |\n| 苹果 | 3 | 新鲜 |')
    expect(parsed.model).toEqual({
      header: ['名称', '数量', '备注'],
      aligns: ['left', 'center', 'right'],
      rows: [['苹果', '3', '新鲜']]
    })
    expect(parsed.columnCount).toBe(3)
  })

  it('支持省略首尾竖线', () => {
    const parsed = parse('a | b\n--- | ---\n1 | 2')
    expect(parsed.model.header).toEqual(['a', 'b'])
    expect(parsed.model.rows).toEqual([['1', '2']])
  })

  it('转义竖线与代码跨度内的竖线不参与分列', () => {
    const parsed = parse('| a | b |\n| --- | --- |\n| x \\| y | `p | q` |')
    expect(parsed.model.rows).toEqual([['x \\| y', '`p | q`']])
  })

  it('不齐整的行按列数补齐或截断', () => {
    const parsed = parse('| a | b | c |\n| --- | --- | --- |\n| 1 |\n| 1 | 2 | 3 | 4 |')
    expect(parsed.model.rows).toEqual([
      ['1', '', ''],
      ['1', '2', '3']
    ])
  })

  it('单元格区间指向去掉空白后的内容', () => {
    const source = '|  a  |   |\n| --- | --- |\n| b | c |'
    const parsed = parse(source)
    const [headerA, headerEmpty] = parsed.cells[0]
    expect(source.slice(headerA.from, headerA.to)).toBe('a')
    expect(headerEmpty.from).toBe(headerEmpty.to)
    expect(source.slice(parsed.cells[1][0].from, parsed.cells[1][0].to)).toBe('b')
  })

  it('缺少分隔行、列数不一致、分隔符非法时返回 null', () => {
    expect(parseTable('| a | b |', 0)).toBeNull()
    expect(parseTable('| a | b |\n| --- |', 0)).toBeNull()
    expect(parseTable('| a | b |\n| --x | --- |', 0)).toBeNull()
    expect(parseTable('| a |\n| --- |\n', 0)?.model.rows).toEqual([])
  })
})

describe('serializeTable', () => {
  it('序列化后可再次解析为同一模型', () => {
    const model: TableModel = {
      header: ['名称', '数量', '备注'],
      aligns: ['none', 'left', 'center'],
      rows: [
        ['a | b', '2', ''],
        ['c', '4', 'x']
      ]
    }
    const text = serializeTable(model)
    expect(text).toBe('| 名称 | 数量 | 备注 |\n| --- | :--- | :---: |\n| a \\| b | 2 |  |\n| c | 4 | x |')

    const parsed = parseTable(text, 0)
    expect(parsed?.model).toEqual({
      header: ['名称', '数量', '备注'],
      aligns: ['none', 'left', 'center'],
      rows: [
        ['a \\| b', '2', ''],
        ['c', '4', 'x']
      ]
    })
  })

  it('不会重复转义已有的 \\|', () => {
    const text = serializeTable({
      header: ['a \\| b', 'c'],
      aligns: ['none', 'none'],
      rows: []
    })
    expect(text).toContain('| a \\| b | c |')
  })
})

describe('表格操作', () => {
  const base: TableModel = {
    header: ['h1', 'h2'],
    aligns: ['none', 'center'],
    rows: [
      ['a', 'b'],
      ['c', 'd']
    ]
  }

  it('插入与删除行', () => {
    const inserted = insertRow(base, 1)
    expect(inserted.rows).toEqual([
      ['a', 'b'],
      ['', ''],
      ['c', 'd']
    ])
    expect(base.rows).toHaveLength(2)
    expect(deleteRow(inserted, 1).rows).toEqual(base.rows)
    expect(deleteRow(base, 9)).toBe(base)
  })

  it('插入与删除列同步表头、对齐与所有行', () => {
    const inserted = insertColumn(base, 1)
    expect(inserted.header).toEqual(['h1', '', 'h2'])
    expect(inserted.aligns).toEqual(['none', 'none', 'center'])
    expect(inserted.rows).toEqual([
      ['a', '', 'b'],
      ['c', '', 'd']
    ])
    expect(deleteColumn(inserted, 1)).toEqual(base)
    expect(deleteColumn(base, 0).header).toEqual(['h2'])
  })

  it('只剩一列时拒绝删除列', () => {
    const single = deleteColumn(base, 0)
    expect(deleteColumn(single, 0)).toBe(single)
  })

  it('设置与循环对齐', () => {
    expect(setAlign(base, 0, 'right').aligns).toEqual(['right', 'center'])
    expect(base.aligns).toEqual(['none', 'center'])
    expect(cycleAlign('none')).toBe('left')
    expect(cycleAlign('left')).toBe('center')
    expect(cycleAlign('center')).toBe('right')
    expect(cycleAlign('right')).toBe('none')
  })
})
