/** 原生菜单转发给渲染进程执行的命令标识 */
export type MenuCommandId =
  | 'file.new'
  | 'file.open'
  | 'file.openFolder'
  | 'file.quickOpen'
  | 'file.save'
  | 'file.saveAs'
  | 'file.closeTab'
  | 'file.print'
  | 'export.html'
  | 'export.pdf'
  | 'export.png'
  | 'export.docx'
  | 'export.latex'
  | 'export.epub'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.cut'
  | 'edit.copy'
  | 'edit.paste'
  | 'edit.selectAll'
  | 'edit.find'
  | 'edit.replace'
  | 'format.bold'
  | 'format.italic'
  | 'format.strike'
  | 'format.highlight'
  | 'format.inlineCode'
  | 'format.codeBlock'
  | 'format.hyperlink'
  | 'format.image'
  | 'paragraph.heading1'
  | 'paragraph.heading2'
  | 'paragraph.heading3'
  | 'paragraph.heading4'
  | 'paragraph.heading5'
  | 'paragraph.heading6'
  | 'paragraph.paragraph'
  | 'paragraph.quote'
  | 'paragraph.orderedList'
  | 'paragraph.bulletList'
  | 'paragraph.taskList'
  | 'paragraph.table'
  | 'paragraph.codeFence'
  | 'paragraph.mathBlock'
  | 'paragraph.hr'
  | 'view.sourceCode'
  | 'view.focusMode'
  | 'view.typewriter'
  | 'view.fullscreen'
  | 'view.toggleSidebar'
  | 'view.toggleOutline'
  | 'view.toggleMenuBar'
  | 'view.toggleFormatToolbar'
  | 'view.resetZoom'
  | 'view.zoomIn'
  | 'view.zoomOut'
  | 'theme.toggle'
  | 'theme.light'
  | 'theme.dark'
  | 'lang.zh'
  | 'lang.en'
  | 'spellcheck.toggle'
  | 'app.preferences'
  | 'app.about'
  | 'help.checkUpdates'

/** 渲染进程同步给主进程的视图开关状态，用于菜单勾选标记 */
export interface AppMenuViewState {
  sourceMode: boolean
  focusMode: boolean
  typewriter: boolean
  sidebarVisible: boolean
  sidebarView: 'files' | 'outline'
  menuBarVisible: boolean
  formatToolbarVisible: boolean
}

/** 主进程菜单模板的只读序列化结果，供自绘菜单栏渲染 */
export interface AppMenuItem {
  label?: string
  type: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
  accelerator?: string
  checked?: boolean
  enabled?: boolean
  role?: string
  command?: MenuCommandId
  submenu?: AppMenuItem[]
}
