import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { activeTabOf, useEditorStore } from '../../app/store/editorStore'
import { jumpToOffset, subscribeCursor } from '../../editor/activeView'
import { parseOutline } from '../../editor/outline'
import { useI18n } from '../../i18n'

export function OutlinePanel() {
  const { t } = useI18n()
  const hasTab = useEditorStore((s) => s.tabs.length > 0)
  const content = useEditorStore((s) => activeTabOf(s)?.content ?? '')
  // 大文档下让大纲解析退到后台，不跟每次击键抢主线程
  const deferred = useDeferredValue(content)
  const items = useMemo(() => parseOutline(deferred), [deferred])

  const [cursor, setCursor] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeCursor(setCursor), [])

  const activeIndex = useMemo(() => {
    let index = -1
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].from > cursor) break
      index = i
    }
    return index
  }, [items, cursor])

  useEffect(() => {
    const active = panelRef.current?.querySelector('.outline-row.is-active')
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!hasTab) {
    return <div className="sidebar__empty">{t('outline.selectDoc')}</div>
  }
  if (items.length === 0) {
    return <div className="sidebar__empty">{t('outline.noHeadings')}</div>
  }

  return (
    <div className="outline-panel" ref={panelRef}>
      {items.map((item, index) => (
        <button
          key={`${item.from}:${index}`}
          type="button"
          className={index === activeIndex ? 'outline-row is-active' : 'outline-row'}
          style={{ paddingLeft: 12 + (item.level - 1) * 13 }}
          title={item.text || t('outline.untitled')}
          onClick={() => jumpToOffset(item.from)}
        >
          <span className={`outline-row__level outline-row__level-${item.level}`}>
            {item.level}
          </span>
          <span className="outline-row__text">{item.text || t('outline.untitled')}</span>
        </button>
      ))}
    </div>
  )
}
