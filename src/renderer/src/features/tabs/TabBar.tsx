import type { MouseEvent } from 'react'
import { useEditorStore } from '../../app/store/editorStore'
import { CloseIcon, PlusIcon } from '../../components/icons'
import { useI18n } from '../../i18n'

export function TabBar() {
  const { t } = useI18n()
  const tabs = useEditorStore((s) => s.tabs)
  const activeId = useEditorStore((s) => s.activeId)
  const activate = useEditorStore((s) => s.activate)
  const closeTab = useEditorStore((s) => s.closeTab)
  const newDocument = useEditorStore((s) => s.newDocument)

  const closeOnMiddle = (event: MouseEvent<HTMLDivElement>, id: string): void => {
    if (event.button !== 1) return
    event.preventDefault()
    void closeTab(id)
  }

  return (
    <div className="tabbar">
      <div className="tabbar__list" role="tablist">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeId}
            className={tab.id === activeId ? 'tab is-active' : 'tab'}
            title={tab.path ?? tab.title}
            onClick={() => activate(tab.id)}
            onMouseDown={(event) => {
              if (event.button === 1) event.preventDefault()
            }}
            onAuxClick={(event) => closeOnMiddle(event, tab.id)}
          >
            <span className="tab__title">{tab.title}</span>
            <span className="tab__status">
              {tab.dirty ? <span className="tab__dot" title={t('common.unsaved')} /> : null}
              <button
                type="button"
                className="tab__close"
                aria-label={t('tabs.closeNamed', { name: tab.title })}
                title={t('tabs.close')}
                onClick={(event) => {
                  event.stopPropagation()
                  void closeTab(tab.id)
                }}
              >
                <CloseIcon size={11} />
              </button>
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="icon-btn tabbar__new"
        title={t('tabs.new')}
        aria-label={t('tabs.new')}
        onClick={() => newDocument()}
      >
        <PlusIcon size={15} />
      </button>
    </div>
  )
}
