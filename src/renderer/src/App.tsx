import { useEffect } from 'react'
import { resolveDark, useEditorStore } from './app/store/editorStore'
import { useAppCommands } from './app/useAppCommands'
import { MarkdownEditor } from './editor/MarkdownEditor'
import { MenuBar } from './features/menubar/MenuBar'
import { ConflictBanner } from './features/conflict/ConflictBanner'
import { QuickOpen } from './features/palette/QuickOpen'
import { Preferences } from './features/preferences/Preferences'
import { RecoveryPrompt } from './features/recovery/RecoveryPrompt'
import { SearchPanel } from './features/search/SearchPanel'
import { Sidebar } from './features/sidebar/Sidebar'
import { StatusBar } from './features/statusbar/StatusBar'
import { TabBar } from './features/tabs/TabBar'
import { TitleBar } from './features/titlebar/TitleBar'
import { Welcome } from './features/welcome/Welcome'

export function App() {
  const theme = useEditorStore((s) => s.theme)
  const systemDark = useEditorStore((s) => s.systemDark)
  const fontSize = useEditorStore((s) => s.fontSize)
  const hasTabs = useEditorStore((s) => s.tabs.length > 0)
  const sidebarVisible = useEditorStore((s) => s.sidebarVisible)
  const dark = resolveDark(theme, systemDark)

  useEffect(() => {
    void useEditorStore.getState().init()
  }, [])

  useAppCommands()

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    document.documentElement.style.setProperty('--md-font-size', `${fontSize}px`)
  }, [fontSize])

  return (
    <div className="app">
      <TitleBar />
      <MenuBar />
      <div className="app__body">
        {sidebarVisible ? <Sidebar /> : null}
        <div className="main-pane">
          {hasTabs ? <TabBar /> : null}
          <ConflictBanner />
          {hasTabs ? <MarkdownEditor /> : <Welcome />}
          <SearchPanel />
        </div>
      </div>
      <StatusBar />
      <QuickOpen />
      <RecoveryPrompt />
      <Preferences />
    </div>
  )
}
