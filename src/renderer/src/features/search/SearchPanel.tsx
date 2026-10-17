import {
  SearchQuery,
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
  setSearchQuery
} from '@codemirror/search'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement
} from 'react'
import { activeTabOf, useEditorStore } from '../../app/store/editorStore'
import { getActiveView, subscribeCursor } from '../../editor/activeView'
import { useI18n } from '../../i18n'

const COUNT_LIMIT = 5000

function prevent(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
}

export function SearchPanel() {
  const { t } = useI18n()
  const open = useEditorStore((s) => s.searchOpen)
  const replaceOpen = useEditorStore((s) => s.searchReplace)
  const searchSeq = useEditorStore((s) => s.searchSeq)
  const activeId = useEditorStore((s) => s.activeId)
  const content = useEditorStore((s) => activeTabOf(s)?.content ?? '')
  const closeSearch = useEditorStore((s) => s.closeSearch)

  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regexp, setRegexp] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [cursor, setCursor] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  useEffect(() => subscribeCursor(setCursor), [])

  const search = useMemo(
    () =>
      new SearchQuery({
        search: query,
        caseSensitive,
        regexp,
        wholeWord,
        replace: replacement
      }),
    [query, caseSensitive, regexp, wholeWord, replacement]
  )

  const invalid = regexp && query.length > 0 && !search.valid

  const matches = useMemo(() => {
    if (!open || !query || invalid) return []
    const view = getActiveView()
    if (!view) return []
    const found: Array<{ from: number; to: number }> = []
    const iter = search.getCursor(view.state)
    for (let next = iter.next(); !next.done; next = iter.next()) {
      found.push(next.value)
      if (found.length >= COUNT_LIMIT) break
    }
    return found
  }, [open, activeId, content, query, invalid, search])

  const current = useMemo(() => {
    const index = matches.findIndex((match) => cursor >= match.from && cursor <= match.to)
    return index < 0 ? 0 : index + 1
  }, [matches, cursor])

  // 打开期间把查询写进当前 EditorState：复用 CM 的高亮与匹配语义
  useEffect(() => {
    const view = getActiveView()
    if (!view) return
    view.dispatch({
      effects: setSearchQuery.of(open ? search : new SearchQuery({ search: '' }))
    })
  }, [open, search, activeId])

  // 每次打开都重新聚焦并全选旧查询，方便直接覆盖
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [open, searchSeq])

  if (!open) return null

  const close = (): void => {
    closeSearch()
    requestAnimationFrame(() => getActiveView()?.focus())
  }

  const step = (forward: boolean): void => {
    const view = getActiveView()
    if (!view || !query) return
    if (forward) findNext(view)
    else findPrevious(view)
  }

  const doReplace = (): void => {
    const view = getActiveView()
    if (!view || !query || invalid) return
    replaceNext(view)
    view.focus()
  }

  const doReplaceAll = (): void => {
    const view = getActiveView()
    if (!view || !query || invalid) return
    replaceAll(view)
    view.focus()
  }

  const onFindKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      prevent(event)
      close()
      return
    }
    if (event.key === 'Tab' && replaceOpen) {
      prevent(event)
      replaceRef.current?.focus()
      return
    }
    if (event.key === 'Enter') {
      prevent(event)
      step(!event.shiftKey)
    }
  }

  const onReplaceKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      prevent(event)
      close()
      return
    }
    if (event.key === 'Enter') {
      prevent(event)
      doReplace()
    }
  }

  const toggleButton = (
    active: boolean,
    label: string,
    title: string,
    onClick: () => void
  ): ReactElement => (
    <button
      type="button"
      className={active ? 'search-panel__toggle is-on' : 'search-panel__toggle'}
      aria-pressed={active}
      aria-label={title}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  )

  return (
    <div className="search-panel" role="dialog" aria-label={t('search.findPlaceholder')}>
      <div className="search-panel__row">
        <input
          ref={inputRef}
          className="search-panel__input"
          value={query}
          placeholder={t('search.findPlaceholder')}
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onFindKeyDown}
        />
        <span className={invalid ? 'search-panel__count is-error' : 'search-panel__count'}>
          {invalid
            ? t('search.invalidRegex')
            : matches.length === 0
              ? t('search.noMatch')
              : t('search.count', { index: current, total: matches.length })}
        </span>
        {toggleButton(caseSensitive, 'Aa', t('search.caseSensitive'), () =>
          setCaseSensitive((value) => !value)
        )}
        {toggleButton(regexp, '.*', t('search.regex'), () => setRegexp((value) => !value))}
        {toggleButton(wholeWord, 'ab|', t('search.wholeWord'), () =>
          setWholeWord((value) => !value)
        )}
        <button
          type="button"
          className="search-panel__toggle"
          title={t('search.prev')}
          aria-label={t('search.prev')}
          onClick={() => step(false)}
        >
          ↑
        </button>
        <button
          type="button"
          className="search-panel__toggle"
          title={t('search.next')}
          aria-label={t('search.next')}
          onClick={() => step(true)}
        >
          ↓
        </button>
        <button
          type="button"
          className="search-panel__toggle"
          title={t('search.close')}
          aria-label={t('search.close')}
          onClick={close}
        >
          ×
        </button>
      </div>

      {replaceOpen ? (
        <div className="search-panel__row">
          <input
            ref={replaceRef}
            className="search-panel__input"
            value={replacement}
            placeholder={t('search.replacePlaceholder')}
            spellCheck={false}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={onReplaceKeyDown}
          />
          <button
            type="button"
            className="search-panel__action"
            disabled={!query || invalid}
            onClick={doReplace}
          >
            {t('search.replace')}
          </button>
          <button
            type="button"
            className="search-panel__action"
            disabled={!query || invalid}
            onClick={doReplaceAll}
          >
            {t('search.replaceAll')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
