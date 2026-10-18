import { useEffect } from 'react'
import { resolveDark, useEditorStore } from './app/store/editorStore'
import { useAppCommands } from './app/useAppCommands'
import { MarkdownEditor } from './editor/MarkdownEditor'
import { About } from './features/about/About'
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
import { FormatToolbar } from './features/toolbar/FormatToolbar'
import { Welcome } from './features/welcome/Welcome'

export function App() {
  const theme = useEditorStore((s) => s.theme)
  const systemDark = useEditorStore((s) => s.systemDark)
  const fontSize = useEditorStore((s) => s.fontSize)
  const hasTabs = useEditorStore((s) => s.tabs.length > 0)
  const sidebarVisible = useEditorStore((s) => s.sidebarVisible)
  const sidebarView = useEditorStore((s) => s.sidebarView)
  const menuBarVisible = useEditorStore((s) => s.menuBarVisible)
  const formatToolbarVisible = useEditorStore((s) => s.formatToolbarVisible)
  const sourceMode = useEditorStore((s) => s.sourceMode)
  const focusMode = useEditorStore((s) => s.focusMode)
  const typewriter = useEditorStore((s) => s.typewriter)
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

  // 主进程菜单与自绘菜单栏共用同一份模板，视图开关的勾选状态先同步过去
  useEffect(() => {
    void window.api.app
      .syncMenuViewState({
        sourceMode,
        focusMode,
        typewriter,
        sidebarVisible,
        sidebarView,
        menuBarVisible,
        formatToolbarVisible
      })
      .catch(() => {})
  }, [
    sourceMode,
    focusMode,
    typewriter,
    sidebarVisible,
    sidebarView,
    menuBarVisible,
    formatToolbarVisible
  ])

  return (
    <div className="app">
      <TitleBar />
      {menuBarVisible ? <MenuBar /> : null}
      {formatToolbarVisible && hasTabs ? <FormatToolbar /> : null}
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
      <About />
    </div>
  )
}
