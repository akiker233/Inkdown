import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc/contract'
import logoDark from '../../assets/logo-mark-dark.png'
import logoLight from '../../assets/logo-mark.png'
import { useEditorStore } from '../../app/store/editorStore'
import { CloseIcon, ExternalLinkIcon, GitHubIcon } from '../../components/icons'
import { useI18n } from '../../i18n'

export function About() {
  const { t } = useI18n()
  const open = useEditorStore((s) => s.aboutOpen)
  const setOpen = useEditorStore((s) => s.setAboutOpen)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setInfo(null)
    void window.api.app
      .getInfo()
      .then(setInfo)
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

  const close = (): void => setOpen(false)

  const openRepo = async (): Promise<void> => {
    if (!info) return
    try {
      await window.api.file.openExternal(info.repositoryUrl)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="modal-layer" onMouseDown={close}>
      <div
        className="modal modal--about"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="about__header">
          <h2 id="about-title">{t('about.title')}</h2>
          <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={close}>
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="about__hero">
          <img className="about__mark about__mark--light" src={logoLight} alt="" draggable={false} />
          <img className="about__mark about__mark--dark" src={logoDark} alt="" draggable={false} />
          <div className="about__name">Inkdown</div>
          <div className="about__version">
            {info ? t('about.version', { version: info.version }) : '—'}
          </div>
          <p className="about__desc">{t('about.detail')}</p>
        </div>

        <button
          type="button"
          className="about__repo"
          title={t('about.openRepo')}
          aria-label={t('about.openRepo')}
          disabled={!info}
          onClick={() => void openRepo()}
        >
          <span className="about__repo-icon">
            <GitHubIcon size={20} />
          </span>
          <span className="about__repo-text">
            <span className="about__repo-label">{t('about.repo')}</span>
            <span className="about__repo-path">
              {info ? info.repositoryUrl.replace(/^https?:\/\//, '') : 'github.com/akiker233/Inkdown'}
            </span>
          </span>
          <span className="about__repo-open">
            <ExternalLinkIcon size={15} />
          </span>
        </button>

        {error ? <p className="about__error">{error}</p> : null}

        <p className="about__meta">
          <span>{t('about.license')}</span>
          <span>Copyright © 2026 Inkdown Contributors</span>
        </p>

        <div className="modal__actions">
          <button type="button" className="btn" onClick={close}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
