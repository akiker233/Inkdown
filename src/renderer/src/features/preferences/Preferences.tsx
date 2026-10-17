import { useEffect, useState } from 'react'
import type { AppInfo, AppSettings, FileAssociationState } from '@shared/ipc/contract'
import type { UpdateCheckResult } from '@shared/types/update'
import { useEditorStore } from '../../app/store/editorStore'
import { CloseIcon, DefaultAppIcon } from '../../components/icons'
import { useI18n } from '../../i18n'

export function Preferences() {
  const { t } = useI18n()
  const open = useEditorStore((s) => s.preferencesOpen)
  const setOpen = useEditorStore((s) => s.setPreferencesOpen)
  const menuBarVisible = useEditorStore((s) => s.menuBarVisible)
  const setMenuBarVisible = useEditorStore((s) => s.setMenuBarVisible)
  const formatToolbarVisible = useEditorStore((s) => s.formatToolbarVisible)
  const setFormatToolbarVisible = useEditorStore((s) => s.setFormatToolbarVisible)
  const [state, setState] = useState<FileAssociationState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

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
    setUpdateResult(null)
    setUpdateError(null)
    setSettingsError(null)
    setSettings(null)
    setAppInfo(null)
    void Promise.all([window.api.app.getSettings(), window.api.app.getInfo()])
      .then(([nextSettings, info]) => {
        setSettings(nextSettings)
        setAppInfo(info)
      })
      .catch((cause: unknown) => setUpdateError(String(cause)))
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

  const fail = (cause: unknown): string =>
    t('prefs.error', { error: cause instanceof Error ? cause.message : String(cause) })

  const run = async (action: () => Promise<FileAssociationState>): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setState(await action())
    } catch (cause) {
      setError(fail(cause))
    } finally {
      setBusy(false)
    }
  }

  const reasonText = (): string => {
    if (state?.reason === 'portable') return t('prefs.reasonPortable')
    if (state?.reason === 'dev') return t('prefs.reasonDev')
    return t('prefs.reasonPlatform')
  }

  const toggleAutoUpdate = async (enabled: boolean): Promise<void> => {
    if (!settings) return
    const previous = settings
    setSettings({ ...settings, autoUpdate: enabled })
    setSettingsError(null)
    try {
      setSettings(await window.api.app.patchSettings({ autoUpdate: enabled }))
    } catch (cause) {
      setSettings(previous)
      setSettingsError(fail(cause))
    }
  }

  const checkUpdates = async (): Promise<void> => {
    setUpdateBusy(true)
    setUpdateError(null)
    try {
      setUpdateResult(await window.api.app.checkUpdates({ silent: true }))
    } catch (cause) {
      setUpdateError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setUpdateBusy(false)
    }
  }

  const applyUpdate = async (): Promise<void> => {
    if (!updateResult) return
    if (updateResult.canAutoInstall) {
      setUpdateBusy(true)
      setUpdateError(null)
      try {
        setUpdateResult(await window.api.app.checkUpdates())
      } catch (cause) {
        setUpdateError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setUpdateBusy(false)
      }
      return
    }
    if (!updateResult.releaseUrl) return
    try {
      await window.api.file.openExternal(updateResult.releaseUrl)
    } catch (cause) {
      setUpdateError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const updateHint = (): string => {
    if (updateBusy) return t('prefs.checkingUpdates')
    if (updateError) return t('prefs.updateCheckFailed', { error: updateError })
    if (!updateResult) return t('prefs.updateIdle')
    if (updateResult.status === 'available') {
      return t('prefs.updateAvailable', { version: updateResult.latestVersion ?? '' })
    }
    if (updateResult.status === 'error') {
      return t('prefs.updateCheckFailed', { error: updateResult.error ?? '' })
    }
    if (updateResult.status === 'busy') return t('prefs.updateBusy')
    return t('prefs.upToDate')
  }

  const currentVersion = appInfo?.version ?? updateResult?.currentVersion ?? '—'
  const updateFailed = Boolean(updateError) || updateResult?.status === 'error'

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
          <h3>{t('prefs.interfaceTitle')}</h3>
          <p>{t('prefs.interfaceDesc')}</p>

          <div className="prefs__row">
            <span className="prefs__text">
              <span className="prefs__label">{t('prefs.menuBar')}</span>
              <span className="prefs__hint">{t('prefs.menuBarHint')}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={menuBarVisible}
              aria-label={t('prefs.menuBar')}
              className={menuBarVisible ? 'switch is-on' : 'switch'}
              onClick={() => setMenuBarVisible(!menuBarVisible)}
            >
              <span />
            </button>
          </div>

          <div className="prefs__row">
            <span className="prefs__text">
              <span className="prefs__label">{t('prefs.formatToolbar')}</span>
              <span className="prefs__hint">{t('prefs.formatToolbarHint')}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={formatToolbarVisible}
              aria-label={t('prefs.formatToolbar')}
              className={formatToolbarVisible ? 'switch is-on' : 'switch'}
              onClick={() => setFormatToolbarVisible(!formatToolbarVisible)}
            >
              <span />
            </button>
          </div>
        </section>

        <section className="prefs__section">
          <h3>{t('prefs.updateTitle')}</h3>
          <p>{t('prefs.updateDesc')}</p>

          <div className="prefs__row">
            <span className="prefs__text">
              <span className="prefs__label">
                {t('prefs.currentVersion', { version: currentVersion })}
              </span>
              <span
                className={updateFailed ? 'prefs__hint prefs__update-error' : 'prefs__hint'}
                aria-live="polite"
              >
                {updateHint()}
              </span>
            </span>
            <button
              type="button"
              className="btn"
              disabled={updateBusy || !settings}
              onClick={() => void checkUpdates()}
            >
              {updateBusy
                ? t('prefs.checkingUpdates')
                : updateResult || updateError
                  ? t('prefs.checkAgain')
                  : t('prefs.checkUpdates')}
            </button>
          </div>

          <div className="prefs__row">
            <span className="prefs__text">
              <span className="prefs__label">{t('prefs.autoCheckUpdates')}</span>
              <span className="prefs__hint">{t('prefs.autoCheckHint')}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={settings?.autoUpdate ?? false}
              aria-label={t('prefs.autoCheckUpdates')}
              className={settings?.autoUpdate ? 'switch is-on' : 'switch'}
              disabled={!settings}
              onClick={() => void toggleAutoUpdate(!settings?.autoUpdate)}
            >
              <span />
            </button>
          </div>

          {settingsError ? <p className="prefs__error">{settingsError}</p> : null}

          {updateResult?.status === 'available' ? (
            <div className="prefs__update-result">
              <span className="prefs__text">
                <span className="prefs__label">
                  {updateResult.releaseName ??
                    t('prefs.updateAvailable', { version: updateResult.latestVersion ?? '' })}
                </span>
                {updateResult.publishedAt ? (
                  <span className="prefs__hint">
                    {new Date(updateResult.publishedAt).toLocaleDateString()}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                className="btn btn--primary"
                disabled={updateBusy}
                onClick={() => void applyUpdate()}
              >
                {updateResult.canAutoInstall
                  ? t('prefs.downloadAndInstall')
                  : t('prefs.openDownload')}
              </button>
            </div>
          ) : null}
        </section>

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
