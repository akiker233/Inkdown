import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { activeTabOf, useEditorStore } from '../../app/store/editorStore'
import { analyzeText } from '../../editor/stats'
import { useI18n } from '../../i18n'
import { WordCountPanel } from './WordCountPanel'

function encodingLabel(encoding: string): string {
  if (encoding === 'utf8-bom') return 'UTF-8 BOM'
  if (encoding === 'utf16le') return 'UTF-16 LE'
  return 'UTF-8'
}

export function StatusBar() {
  const { t } = useI18n()
  const content = useEditorStore((s) => activeTabOf(s)?.content ?? '')
  const eol = useEditorStore((s) => activeTabOf(s)?.eol ?? 'lf')
  const encoding = useEditorStore((s) => activeTabOf(s)?.encoding ?? 'utf8')
  const sourceMode = useEditorStore((s) => s.sourceMode)

  // 大文档下统计不该阻塞输入，跟随延迟值重算
  const deferredContent = useDeferredValue(content)
  const stats = useMemo(() => analyzeText(deferredContent), [deferredContent])

  const [countOpen, setCountOpen] = useState(false)
  const countRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!countOpen) return
    const onMouseDown = (event: MouseEvent): void => {
      if (!countRef.current?.contains(event.target as Node)) setCountOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setCountOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [countOpen])

  return (
    <footer className="statusbar">
      <div className="statusbar__spacer" />
      <div className="statusbar__count" ref={countRef}>
        <button
          type="button"
          className={`statusbar__item statusbar__count-btn${countOpen ? ' is-open' : ''}`}
          title={t('status.wordCount')}
          aria-expanded={countOpen}
          onClick={() => setCountOpen((open) => !open)}
        >
          {t('status.words', { n: stats.words })}
        </button>
        {countOpen ? <WordCountPanel stats={stats} /> : null}
      </div>
      <span className="statusbar__item">{t('status.chars', { n: stats.chars })}</span>
      <span className="statusbar__item">{t('status.lines', { n: stats.lines })}</span>
      <span className="statusbar__item">{eol === 'crlf' ? 'CRLF' : 'LF'}</span>
      <span className="statusbar__item">{encodingLabel(encoding)}</span>
      <button
        type="button"
        className={`statusbar__item statusbar__mode${sourceMode ? ' is-on' : ''}`}
        title={t('status.modeTip')}
        onClick={() => useEditorStore.getState().toggleSourceMode()}
      >
        {t(sourceMode ? 'status.sourceMode' : 'status.rendered')}
      </button>
    </footer>
  )
}
