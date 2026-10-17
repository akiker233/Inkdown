import { activeTabOf, resolveDark, useEditorStore } from '../../app/store/editorStore'
import { SettingsIcon, SidebarIcon } from '../../components/icons'
import { useI18n } from '../../i18n'

function SunIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6l1.6-1.6M18 6l1.6-1.6" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.2 14.8A8.6 8.6 0 1 1 9.2 3.8a6.9 6.9 0 0 0 11 11Z" />
    </svg>
  )
}

export function TitleBar() {
  const { t } = useI18n()
  const title = useEditorStore((s) => activeTabOf(s)?.title ?? 'Inkdown')
  const path = useEditorStore((s) => activeTabOf(s)?.path ?? null)
  const dirty = useEditorStore((s) => activeTabOf(s)?.dirty ?? false)
  const theme = useEditorStore((s) => s.theme)
  const systemDark = useEditorStore((s) => s.systemDark)
  const setTheme = useEditorStore((s) => s.setTheme)
  const sidebarVisible = useEditorStore((s) => s.sidebarVisible)
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar)
  const setPreferencesOpen = useEditorStore((s) => s.setPreferencesOpen)

  const dark = resolveDark(theme, systemDark)

  return (
    <header className="titlebar">
      <span className="titlebar__title" title={path ?? undefined}>
        {title}
      </span>
      {dirty ? (
        <span className="titlebar__dirty" title={t('common.unsaved')}>
          ●
        </span>
      ) : null}

      <div className="titlebar__spacer" />

      <div className="titlebar__actions">
        <button
          type="button"
          className={sidebarVisible ? 'icon-btn is-on' : 'icon-btn'}
          title={t(sidebarVisible ? 'title.hideSidebar' : 'title.showSidebar')}
          aria-label={t(sidebarVisible ? 'title.hideSidebar' : 'title.showSidebar')}
          aria-pressed={sidebarVisible}
          onClick={() => toggleSidebar()}
        >
          <SidebarIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t(dark ? 'title.lightTheme' : 'title.darkTheme')}
          aria-label={t(dark ? 'title.lightTheme' : 'title.darkTheme')}
          onClick={() => void setTheme(dark ? 'light' : 'dark')}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('prefs.title')}
          aria-label={t('prefs.title')}
          onClick={() => setPreferencesOpen(true)}
        >
          <SettingsIcon size={15} />
        </button>
      </div>
    </header>
  )
}
