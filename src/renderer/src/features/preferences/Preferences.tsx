import { useEffect, useState } from 'react'
import type { FileAssociationState } from '@shared/ipc/contract'
import { useEditorStore } from '../../app/store/editorStore'
import { CloseIcon, DefaultAppIcon } from '../../components/icons'
import { useI18n } from '../../i18n'

export function Preferences() {
  const { t } = useI18n()
  const open = useEditorStore((s) => s.preferencesOpen)
  const setOpen = useEditorStore((s) => s.setPreferencesOpen)
  const [state, setState] = useState<FileAssociationState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const close = (): void => setOpen(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setNotice(null)
    setState(null)
    void window.api.fileAssoc
      .get()
      .then(setState)
      .catch((cause: unknown) => setError(String(cause)))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  if (!open) return null

  const run = async (action: () => Promise<FileAssociationState>): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setState(await action())
    } catch (cause) {
      setError(t('prefs.error', { error: cause instanceof Error ? cause.message : String(cause) }))
    } finally {
      setBusy(false)
    }
  }

  const reasonText = (): string => {
    if (state?.reason === 'portable') return t('prefs.reasonPortable')
    if (state?.reason === 'dev') return t('prefs.reasonDev')
    return t('prefs.reasonPlatform')
  }

  return (
    <div className="modal-layer" onMouseDown={close}>
      <div
        className="modal modal--prefs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prefs-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="prefs__header">
          <h2 id="prefs-title">{t('prefs.title')}</h2>
          <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={close}>
            <CloseIcon size={12} />
          </button>
        </div>

        <section className="prefs__section">
          <h3>{t('prefs.assocTitle')}</h3>
          <p>{t('prefs.assocDesc')}</p>

          {!state ? (
            <p className="prefs__hint">{t('prefs.loading')}</p>
          ) : !state.supported ? (
            <p className="prefs__note">{reasonText()}</p>
          ) : (
            <>
              <div className="prefs__row">
                <span className="prefs__text">
                  <span className="prefs__label">{t('prefs.contextMenu')}</span>
                  <span className="prefs__hint">{t('prefs.contextMenuHint')}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={state.contextMenu}
                  aria-label={t('prefs.contextMenu')}
                  className={state.contextMenu ? 'switch is-on' : 'switch'}
                  disabled={busy}
                  onClick={() =>
                    void run(() => window.api.fileAssoc.setContextMenu(!state.contextMenu))
                  }
                >
                  <span />
                </button>
              </div>

              <div className="prefs__row">
                <span className="prefs__text">
                  <span className="prefs__label">{t('prefs.defaultApp')}</span>
                  <span className="prefs__hint">
                    {state.isDefault ? t('prefs.defaultActive') : t('prefs.defaultHint')}
                  </span>
                </span>
                {state.isDefault ? (
                  <span className="prefs__default-badge">
                    <DefaultAppIcon size={14} />
                    {t('prefs.isDefault')}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const next = await window.api.fileAssoc.openDefaultApps()
                        setNotice(t('prefs.defaultOpened'))
                        return next
                      })
                    }
                  >
                    {t('prefs.setDefault')}
                  </button>
                )}
              </div>

              <p className="prefs__status">
                {state.registered ? t('prefs.registered') : t('prefs.notRegistered')}
              </p>
              {notice ? <p className="prefs__note">{notice}</p> : null}
            </>
          )}

          {error ? <p className="prefs__error">{error}</p> : null}
        </section>

        <div className="modal__actions">
          <button type="button" className="btn" onClick={close}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
