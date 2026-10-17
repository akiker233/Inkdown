import { useSyncExternalStore } from 'react'
import type { AppLanguage } from '@shared/ipc/contract'

/**
 * 渲染层唯一文案源。
 * 刻意不依赖 store：store 的错误提示也要用 t()，反向依赖会形成环。
 */
const zh = {
  'app.untitled': '未命名.md',
  'app.untitledN': '未命名 {n}.md',
  'common.unsaved': '有未保存的更改',
  'common.cancel': '取消',
  'common.confirm': '确定',
  'common.close': '关闭',

  'title.hideSidebar': '隐藏侧边栏',
  'title.showSidebar': '显示侧边栏',
  'title.lightTheme': '切换到浅色主题',
  'title.darkTheme': '切换到深色主题',
  'title.new': '新建',
  'title.open': '打开',
  'title.save': '保存',
  'title.saveAs': '另存为',

  'welcome.tagline': '专注写作的 Markdown 编辑器',
  'welcome.new': '新建文档',
  'welcome.openFile': '打开文件',
  'welcome.openFolder': '打开文件夹',
  'welcome.recent': '最近打开',

  'tabs.closeNamed': '关闭 {name}',
  'tabs.close': '关闭标签页',
  'tabs.new': '新建标签页',

  'sidebar.workspace': '工作区',
  'sidebar.outline': '大纲',
  'sidebar.filesTab': '文件',
  'sidebar.outlineTab': '大纲',
  'sidebar.view': '侧栏视图',
  'sidebar.newFile': '新建文件',
  'sidebar.refresh': '刷新',
  'sidebar.closeFolder': '关闭文件夹',
  'sidebar.hide': '隐藏侧边栏',
  'sidebar.openFolderHint': '打开一个文件夹，在这里浏览和新建文档。',
  'sidebar.openFolder': '打开文件夹',
  'sidebar.loading': '正在读取…',
  'sidebar.empty': '这个文件夹还是空的。',
  'sidebar.newHere': '新建文件',

  'tree.open': '打开',
  'tree.newFile': '新建文件',
  'tree.newFolder': '新建文件夹',
  'tree.rename': '重命名',
  'tree.refresh': '刷新',
  'tree.delete': '删除',
  'tree.reveal': '在资源管理器中显示',
  'tree.closeFolder': '关闭文件夹',

  'prompt.newFile': '新建文件',
  'prompt.newFolder': '新建文件夹',
  'prompt.renameTitle': '重命名',
  'prompt.fileName': '文件名.md',
  'prompt.folderName': '文件夹名',
  'prompt.create': '创建',
  'prompt.rename': '重命名',

  'palette.workspacePlaceholder': '按文件名搜索工作区…',
  'palette.recentPlaceholder': '按文件名搜索最近打开…',
  'palette.noFiles': '没有可搜索的文件',
  'palette.noMatch': '没有匹配的文件',

  'conflict.deleted': '这个文件已在磁盘上被删除。',
  'conflict.modified': '这个文件已在磁盘上被修改，编辑器里是旧内容。',
  'conflict.resave': '重新保存',
  'conflict.reload': '重新加载',
  'conflict.keep': '保留我的更改',

  'recovery.title': '恢复未保存的内容',
  'recovery.body':
    '上次退出前有 {n} 个文档未保存。恢复后会以未保存状态打开，你可以再决定是否写入磁盘。',
  'recovery.more': '以及另外 {n} 个文档',
  'recovery.discard': '丢弃',
  'recovery.restore': '恢复',

  'status.wordCount': '字数统计',
  'status.wordCountTip': '打开字数统计',
  'status.words': '{n} 字',
  'status.chars': '{n} 字符',
  'status.lines': '{n} 行',
  'status.sourceMode': '源码模式',
  'status.rendered': '即时渲染',
  'status.modeTip': 'Ctrl+/ 切换源码模式',

  'count.title': '文档统计',
  'count.words': '字数',
  'count.chars': '字符数',
  'count.noSpaces': '不含空格',
  'count.lines': '行数',
  'count.paragraphs': '段落数',
  'count.cjkLatin': '中文 {cjk} · 英文/数字 {latin}',
  'count.reading': '预计阅读 {value}',
  'count.minutes': '{n} 分钟',
  'count.dash': '—',

  'outline.selectDoc': '打开一个文档后在这里浏览标题。',
  'outline.noHeadings': '当前文档还没有标题。',
  'outline.untitled': '未命名标题',

  'widget.taskDone': '标记为未完成',
  'widget.taskUndone': '标记为已完成',
  'widget.imageFailed': '图片无法加载：{src}',
  'widget.codeLang': '代码块语言',
  'widget.copy': '复制',
  'widget.copyAria': '复制代码',
  'widget.copied': '已复制',
  'widget.copyFailed': '复制失败',
  'widget.mermaidClick': '点击查看 Mermaid 源码',
  'widget.mermaidRendering': '正在渲染图表…',
  'widget.mermaidFailed': '图表渲染失败',
  'widget.mermaidHint': '点击图表查看源码',
  'widget.mermaidEmpty': '图表内容为空',
  'widget.tableToolbar': '表格操作',
  'widget.addRow': '＋行',
  'widget.addRowTip': '在下方插入行',
  'widget.removeRow': '－行',
  'widget.removeRowTip': '删除当前行',
  'widget.addColumn': '＋列',
  'widget.addColumnTip': '在右侧插入列',
  'widget.removeColumn': '－列',
  'widget.removeColumnTip': '删除当前列',
  'widget.align': '对齐',
  'widget.alignTip': '切换当前列对齐方式',
  'widget.alignCurrent': '当前列：{value}，点击切换',
  'widget.alignNone': '默认',
  'widget.alignLeft': '左对齐',
  'widget.alignCenter': '居中',
  'widget.alignRight': '右对齐',

  'store.initFailed': '初始化失败',
  'store.openFileFailed': '打开文件失败',
  'store.saveFailed': '保存失败',
  'store.openFolderFailed': '打开文件夹失败',
  'store.createFileFailed': '新建文件失败',
  'store.createFolderFailed': '新建文件夹失败',
  'store.renameFailed': '重命名失败',
  'store.deleteFailed': '删除失败',
  'store.reloadFailed': '重新加载失败',
  'store.overwriteTitle': '“{name}” 已在磁盘上被修改',
  'store.overwriteDetail': '继续保存会覆盖磁盘上的新内容。',
  'store.overwrite': '覆盖保存',
  'store.deleteTitle': '确定要删除 “{name}” 吗？',
  'store.deleteRecycle': '文件会移入回收站。',
  'store.deleteCloseTabs': '将同时关闭 {n} 个已打开的标签。',
  'store.deleteDirty': '其中 {n} 个标签有未保存的更改，删除后这些更改将丢失。',
  'store.delete': '删除',
  'store.gotIt': '好',

  'drop.saveFirst': '请先保存文档',
  'drop.saveFirstDetail': '保存后图片会被复制到文档旁边的 assets 文件夹。',
  'drop.insertImageFailed': '插入图片失败',

  'cmd.tableCol': '列 {n}',
  'cmd.linkText': '链接文本',

  'about.title': '关于 Inkdown',
  'about.message': 'Inkdown {version}',
  'about.detail': '专注写作的 Markdown 编辑器',

  'prefs.title': '设置',
  'prefs.assocTitle': 'Markdown 文件关联',
  'prefs.assocDesc': '让 Inkdown 出现在 Markdown 文件的“打开方式”和 Windows 默认应用中。',
  'prefs.contextMenu': '在右键菜单中显示“使用 Inkdown 打开”',
  'prefs.contextMenuHint': '为 .md、.markdown、.mdown、.mkd、.mdx 文件添加菜单项。',
  'prefs.defaultApp': '默认 Markdown 应用',
  'prefs.defaultHint':
    'Windows 要求由你本人确认默认应用。点击后会注册关联并打开系统设置。',
  'prefs.setDefault': '设为默认…',
  'prefs.isDefault': '已是默认应用',
  'prefs.defaultActive': 'Inkdown 已是 .md 文件的默认应用。',
  'prefs.defaultOpened': '已打开 Windows 默认应用设置，请在其中选择 Inkdown。',
  'prefs.registered': '已注册到系统默认应用列表',
  'prefs.notRegistered': '尚未注册到系统默认应用列表',
  'prefs.loading': '正在读取关联状态…',
  'prefs.reasonPlatform': '仅 Windows 支持注册文件关联。',
  'prefs.reasonDev': '开发模式不支持注册文件关联，请使用安装版。',
  'prefs.reasonPortable': '便携版每次运行路径都会变化，请使用安装版注册文件关联。',
  'prefs.error': '操作失败：{error}',

  'search.findPlaceholder': '查找',
  'search.replacePlaceholder': '替换为',
  'search.count': '{index}/{total}',
  'search.noMatch': '无结果',
  'search.prev': '上一个',
  'search.next': '下一个',
  'search.close': '关闭',
  'search.caseSensitive': '区分大小写',
  'search.regex': '正则表达式',
  'search.wholeWord': '全词匹配',
  'search.replace': '替换',
  'search.replaceAll': '全部替换',
  'search.invalidRegex': '正则表达式无效',
  'search.replaced': '已替换 {n} 处',

  'export.noDocument': '没有可导出的文档',
  'export.preparing': '正在渲染文档…',
  'export.title': '导出 {format}',
  'export.successTitle': '导出完成',
  'export.successDetail': '已保存到：\n{path}',
  'export.showInFolder': '在文件夹中显示',
  'export.done': '完成',
  'export.failed': '导出 {format} 失败',
  'export.pandocTitle': '未检测到 Pandoc',
  'export.pandocDetail':
    'Word / LaTeX / EPUB 将使用内置转换。公式和图表会被转为图片，排版保真度可能低于 Pandoc。要继续导出吗？',
  'export.continue': '继续导出',
  'export.cancelExport': '取消',
  'export.printFailed': '打印失败',
  'export.warnImageRemote': '部分远程图片无法下载，导出文件中保留了原链接。',
  'export.warnImageLocal': '部分本地图片无法读取，导出文件中缺少这些图片。',
  'export.warnPandocMissing': '未检测到 Pandoc，已使用内置转换。',
  'export.warnPandocFailed': 'Pandoc 调用失败，已回退到内置转换。',
  'export.warnPngScaled': '文档过长，PNG 已按受限分辨率导出。',
  'export.warnPngTooTall': '文档高度超过 60000 像素，PNG 可能被截断。'
} as const

export type MessageKey = keyof typeof zh

const en: Record<MessageKey, string> = {
  'app.untitled': 'Untitled.md',
  'app.untitledN': 'Untitled {n}.md',
  'common.unsaved': 'Unsaved changes',
  'common.cancel': 'Cancel',
  'common.confirm': 'OK',
  'common.close': 'Close',

  'title.hideSidebar': 'Hide sidebar',
  'title.showSidebar': 'Show sidebar',
  'title.lightTheme': 'Switch to light theme',
  'title.darkTheme': 'Switch to dark theme',
  'title.new': 'New',
  'title.open': 'Open',
  'title.save': 'Save',
  'title.saveAs': 'Save As',

  'welcome.tagline': 'A Markdown editor built for focused writing',
  'welcome.new': 'New document',
  'welcome.openFile': 'Open file',
  'welcome.openFolder': 'Open folder',
  'welcome.recent': 'Recent',

  'tabs.closeNamed': 'Close {name}',
  'tabs.close': 'Close tab',
  'tabs.new': 'New tab',

  'sidebar.workspace': 'Workspace',
  'sidebar.outline': 'Outline',
  'sidebar.filesTab': 'Files',
  'sidebar.outlineTab': 'Outline',
  'sidebar.view': 'Sidebar view',
  'sidebar.newFile': 'New file',
  'sidebar.refresh': 'Refresh',
  'sidebar.closeFolder': 'Close folder',
  'sidebar.hide': 'Hide sidebar',
  'sidebar.openFolderHint': 'Open a folder to browse and create documents here.',
  'sidebar.openFolder': 'Open folder',
  'sidebar.loading': 'Loading…',
  'sidebar.empty': 'This folder is empty.',
  'sidebar.newHere': 'New file',

  'tree.open': 'Open',
  'tree.newFile': 'New file',
  'tree.newFolder': 'New folder',
  'tree.rename': 'Rename',
  'tree.refresh': 'Refresh',
  'tree.delete': 'Delete',
  'tree.reveal': 'Reveal in File Explorer',
  'tree.closeFolder': 'Close folder',

  'prompt.newFile': 'New file',
  'prompt.newFolder': 'New folder',
  'prompt.renameTitle': 'Rename',
  'prompt.fileName': 'name.md',
  'prompt.folderName': 'Folder name',
  'prompt.create': 'Create',
  'prompt.rename': 'Rename',

  'palette.workspacePlaceholder': 'Search workspace by file name…',
  'palette.recentPlaceholder': 'Search recent files by name…',
  'palette.noFiles': 'No files to search',
  'palette.noMatch': 'No matching files',

  'conflict.deleted': 'This file was deleted on disk.',
  'conflict.modified': 'This file changed on disk. The editor shows the old content.',
  'conflict.resave': 'Save again',
  'conflict.reload': 'Reload',
  'conflict.keep': 'Keep my changes',

  'recovery.title': 'Recover unsaved content',
  'recovery.body':
    '{n} document(s) were not saved before the last exit. They will reopen as unsaved, and you can decide whether to write them to disk.',
  'recovery.more': 'and {n} more documents',
  'recovery.discard': 'Discard',
  'recovery.restore': 'Restore',

  'status.wordCount': 'Word count',
  'status.wordCountTip': 'Open word count',
  'status.words': '{n} words',
  'status.chars': '{n} chars',
  'status.lines': '{n} lines',
  'status.sourceMode': 'Source mode',
  'status.rendered': 'Live preview',
  'status.modeTip': 'Ctrl+/ toggles source mode',

  'count.title': 'Document statistics',
  'count.words': 'Words',
  'count.chars': 'Characters',
  'count.noSpaces': 'Without spaces',
  'count.lines': 'Lines',
  'count.paragraphs': 'Paragraphs',
  'count.cjkLatin': 'CJK {cjk} · Latin/digits {latin}',
  'count.reading': 'Reading time {value}',
  'count.minutes': '{n} min',
  'count.dash': '—',

  'outline.selectDoc': 'Open a document to browse its headings here.',
  'outline.noHeadings': 'This document has no headings.',
  'outline.untitled': 'Untitled heading',

  'widget.taskDone': 'Mark as incomplete',
  'widget.taskUndone': 'Mark as complete',
  'widget.imageFailed': 'Image failed to load: {src}',
  'widget.codeLang': 'Code block language',
  'widget.copy': 'Copy',
  'widget.copyAria': 'Copy code',
  'widget.copied': 'Copied',
  'widget.copyFailed': 'Copy failed',
  'widget.mermaidClick': 'Click to view the Mermaid source',
  'widget.mermaidRendering': 'Rendering diagram…',
  'widget.mermaidFailed': 'Diagram failed to render',
  'widget.mermaidHint': 'Click the diagram to view source',
  'widget.mermaidEmpty': 'Diagram source is empty',
  'widget.tableToolbar': 'Table actions',
  'widget.addRow': '+Row',
  'widget.addRowTip': 'Insert row below',
  'widget.removeRow': '−Row',
  'widget.removeRowTip': 'Delete current row',
  'widget.addColumn': '+Col',
  'widget.addColumnTip': 'Insert column to the right',
  'widget.removeColumn': '−Col',
  'widget.removeColumnTip': 'Delete current column',
  'widget.align': 'Align',
  'widget.alignTip': 'Cycle column alignment',
  'widget.alignCurrent': 'Current column: {value}, click to change',
  'widget.alignNone': 'Default',
  'widget.alignLeft': 'Left',
  'widget.alignCenter': 'Center',
  'widget.alignRight': 'Right',

  'store.initFailed': 'Initialization failed',
  'store.openFileFailed': 'Failed to open file',
  'store.saveFailed': 'Failed to save',
  'store.openFolderFailed': 'Failed to open folder',
  'store.createFileFailed': 'Failed to create file',
  'store.createFolderFailed': 'Failed to create folder',
  'store.renameFailed': 'Failed to rename',
  'store.deleteFailed': 'Failed to delete',
  'store.reloadFailed': 'Failed to reload',
  'store.overwriteTitle': '“{name}” changed on disk',
  'store.overwriteDetail': 'Saving now will overwrite the newer content on disk.',
  'store.overwrite': 'Overwrite',
  'store.deleteTitle': 'Delete “{name}”?',
  'store.deleteRecycle': 'The item will be moved to the Recycle Bin.',
  'store.deleteCloseTabs': '{n} open tab(s) will be closed as well.',
  'store.deleteDirty': '{n} tab(s) have unsaved changes that will be lost.',
  'store.delete': 'Delete',
  'store.gotIt': 'OK',

  'drop.saveFirst': 'Save the document first',
  'drop.saveFirstDetail': 'Images are copied into an assets folder next to the document.',
  'drop.insertImageFailed': 'Failed to insert image',

  'cmd.tableCol': 'Column {n}',
  'cmd.linkText': 'Link text',

  'about.title': 'About Inkdown',
  'about.message': 'Inkdown {version}',
  'about.detail': 'A Markdown editor built for focused writing',

  'prefs.title': 'Preferences',
  'prefs.assocTitle': 'Markdown File Associations',
  'prefs.assocDesc':
    'Make Inkdown available in “Open with” and Windows Default Apps for Markdown files.',
  'prefs.contextMenu': 'Show “Open with Inkdown” in the file context menu',
  'prefs.contextMenuHint':
    'Adds a menu entry for .md, .markdown, .mdown, .mkd, and .mdx files.',
  'prefs.defaultApp': 'Default Markdown app',
  'prefs.defaultHint':
    'Windows requires you to confirm the default app yourself. This registers the association and opens system settings.',
  'prefs.setDefault': 'Set Default…',
  'prefs.isDefault': 'Already default',
  'prefs.defaultActive': 'Inkdown is already the default app for .md files.',
  'prefs.defaultOpened':
    'Windows Default Apps settings opened. Select Inkdown there.',
  'prefs.registered': 'Registered in Windows Default Apps',
  'prefs.notRegistered': 'Not yet registered in Windows Default Apps',
  'prefs.loading': 'Reading association status…',
  'prefs.reasonPlatform': 'File associations are only supported on Windows.',
  'prefs.reasonDev':
    'File associations are unavailable in development mode. Use an installed build.',
  'prefs.reasonPortable':
    'The portable build runs from a changing path. Use an installed build to register associations.',
  'prefs.error': 'Operation failed: {error}',

  'search.findPlaceholder': 'Find',
  'search.replacePlaceholder': 'Replace with',
  'search.count': '{index}/{total}',
  'search.noMatch': 'No results',
  'search.prev': 'Previous',
  'search.next': 'Next',
  'search.close': 'Close',
  'search.caseSensitive': 'Match case',
  'search.regex': 'Regular expression',
  'search.wholeWord': 'Whole word',
  'search.replace': 'Replace',
  'search.replaceAll': 'Replace all',
  'search.invalidRegex': 'Invalid regular expression',
  'search.replaced': 'Replaced {n}',

  'export.noDocument': 'There is no document to export',
  'export.preparing': 'Rendering document…',
  'export.title': 'Export as {format}',
  'export.successTitle': 'Export complete',
  'export.successDetail': 'Saved to:\n{path}',
  'export.showInFolder': 'Show in Folder',
  'export.done': 'Done',
  'export.failed': 'Failed to export {format}',
  'export.pandocTitle': 'Pandoc not found',
  'export.pandocDetail':
    'Word / LaTeX / EPUB will use the built-in converter. Math and diagrams are rasterized, so layout fidelity may be lower than with Pandoc. Continue?',
  'export.continue': 'Continue',
  'export.cancelExport': 'Cancel',
  'export.printFailed': 'Printing failed',
  'export.warnImageRemote': 'Some remote images could not be downloaded; their links were kept.',
  'export.warnImageLocal': 'Some local images could not be read and are missing from the export.',
  'export.warnPandocMissing': 'Pandoc was not found; the built-in converter was used.',
  'export.warnPandocFailed': 'Pandoc failed and the built-in converter was used instead.',
  'export.warnPngScaled': 'The document is very long; PNG was exported at a reduced scale.',
  'export.warnPngTooTall': 'The document exceeds 60000 px in height; the PNG may be truncated.'
}

const dictionaries: Record<AppLanguage, Record<MessageKey, string>> = { zh, en }

let current: AppLanguage = 'zh'
const listeners = new Set<() => void>()

export function getLanguage(): AppLanguage {
  return current
}

export function setLanguage(language: AppLanguage): void {
  if (current === language) return
  current = language
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }
  for (const listener of listeners) listener()
}

function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function translate(
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  let text: string = dictionaries[current][key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value))
    }
  }
  return text
}

/** 组件里用这个：语言切换时自动重渲染 */
export function useI18n(): { lang: AppLanguage; t: typeof translate } {
  const lang = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage)
  return { lang, t: translate }
}

/** 非 React 环境（widget / store）直接用 */
export const t = translate
