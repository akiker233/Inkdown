import logoDark from '../../assets/logo-mark-dark.png'
import logoLight from '../../assets/logo-mark.png'
import { baseName, dirName } from '../../app/paths'
import { useEditorStore } from '../../app/store/editorStore'
import { useI18n } from '../../i18n'

export function Welcome() {
  const { t } = useI18n()
  const recentFiles = useEditorStore((s) => s.recentFiles)
  const newDocument = useEditorStore((s) => s.newDocument)
  const openPath = useEditorStore((s) => s.openPath)
  const openWorkspaceDialog = useEditorStore((s) => s.openWorkspaceDialog)

  const openFiles = async (): Promise<void> => {
    const { paths } = await window.api.dialog.openFile({ multiple: true })
    if (paths.length > 0) await useEditorStore.getState().openPaths(paths)
  }

  return (
    <main className="welcome">
      <div className="welcome__inner">
        <div className="welcome__brand">
          <img className="welcome__mark welcome__mark--light" src={logoLight} alt="" draggable={false} />
          <img className="welcome__mark welcome__mark--dark" src={logoDark} alt="" draggable={false} />
          <div className="welcome__logo">Inkdown</div>
        </div>
        <p className="welcome__tagline">{t('welcome.tagline')}</p>

        <div className="welcome__actions">
          <button
            type="button"
            className="welcome__action welcome__action--primary"
            onClick={() => newDocument()}
          >
            {t('welcome.new')}
          </button>
          <button type="button" className="welcome__action" onClick={() => void openFiles()}>
            {t('welcome.openFile')}
          </button>
          <button
            type="button"
            className="welcome__action"
            onClick={() => void openWorkspaceDialog()}
          >
            {t('welcome.openFolder')}
          </button>
        </div>

        {recentFiles.length > 0 ? (
          <section className="welcome__recent">
            <h2>{t('welcome.recent')}</h2>
            <ul>
              {recentFiles.slice(0, 8).map((path) => (
                <li key={path}>
                  <button type="button" title={path} onClick={() => void openPath(path)}>
                    <span className="welcome__recent-name">{baseName(path)}</span>
                    <span className="welcome__recent-path">{dirName(path)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  )
}
