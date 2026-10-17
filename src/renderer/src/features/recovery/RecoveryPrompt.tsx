import { createPortal } from 'react-dom'
import { useEditorStore } from '../../app/store/editorStore'
import { useI18n } from '../../i18n'

export function RecoveryPrompt() {
  const { t } = useI18n()
  const snapshot = useEditorStore((s) => s.recoveryPrompt)
  const resolveRecovery = useEditorStore((s) => s.resolveRecovery)

  if (!snapshot) return null

  const entries = snapshot.entries
  const shown = entries.slice(0, 6)

  return createPortal(
    <div className="modal-layer">
      <div className="modal">
        <h2>{t('recovery.title')}</h2>
        <p>{t('recovery.body', { n: entries.length })}</p>
        <ul className="modal__list">
          {shown.map((entry) => (
            <li key={entry.docId}>{entry.title}</li>
          ))}
          {entries.length > shown.length ? (
            <li>{t('recovery.more', { n: entries.length - shown.length })}</li>
          ) : null}
        </ul>
        <div className="modal__actions">
          <button type="button" className="btn" onClick={() => void resolveRecovery(false)}>
            {t('recovery.discard')}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void resolveRecovery(true)}
          >
            {t('recovery.restore')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
