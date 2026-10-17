import { describe, expect, it } from 'vitest'
import { mainT } from './i18n'

describe('main process i18n', () => {
  it('按键取对应语言文案', () => {
    expect(mainT('zh', 'menu.file')).toBe('文件')
    expect(mainT('en', 'menu.file')).toBe('File')
  })

  it('参数替换用于对话框与错误文案', () => {
    expect(mainT('en', 'dialog.confirmClose', { name: 'a.md' })).toContain('a.md')
    expect(mainT('zh', 'error.externalHttpOnly', { url: 'ftp://x' })).toContain('ftp://x')
  })
})
