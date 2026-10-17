import { activeTabOf, useEditorStore } from '../../app/store/editorStore'
import { useI18n } from '../../i18n'

export function ConflictBanner() {
  const { t } = useI18n()
  const tabId = useEditorStore((s) => s.activeId)
  const conflict = useEditorStore((s) => activeTabOf(s)?.conflict ?? null)
  const resolveConflict = useEditorStore((s) => s.resolveConflict)

  if (!tabId || !conflict) return null

  return (
    <div className="conflict">
      <span className="conflict__text">
        {conflict.deleted ? t('conflict.deleted') : t('conflict.modified')}
      </span>
      <div className="conflict__actions">
        {conflict.deleted ? (
          <button type="button" onClick={() => void resolveConflict(tabId, 'save')}>
            {t('conflict.resave')}
          </button>
        ) : (
          <button type="button" onClick={() => void resolveConflict(tabId, 'reload')}>
            {t('conflict.reload')}
          </button>
        )}
        <button type="button" onClick={() => void resolveConflict(tabId, 'keep')}>
          {t('conflict.keep')}
        </button>
      </div>
    </div>
  )
}
