import { afterEach, describe, expect, it } from 'vitest'
import { getLanguage, setLanguage, t } from './i18n'

afterEach(() => setLanguage('zh'))

describe('renderer i18n', () => {
  it('中英文切换生效', () => {
    setLanguage('zh')
    expect(getLanguage()).toBe('zh')
    expect(t('app.untitled')).toBe('未命名.md')

    setLanguage('en')
    expect(getLanguage()).toBe('en')
    expect(t('app.untitled')).toBe('Untitled.md')
  })

  it('按参数替换占位符', () => {
    setLanguage('zh')
    expect(t('search.count', { index: 2, total: 5 })).toBe('2/5')
    setLanguage('en')
    expect(t('search.count', { index: 2, total: 5 })).toBe('2/5')
  })
})
