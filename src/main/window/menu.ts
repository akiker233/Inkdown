import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { AppLanguage } from '@shared/ipc/contract'
import { CH } from '@shared/ipc/channels'
import { mainT } from '../i18n'
import type { AppMenuItem, MenuCommandId } from '@shared/types/menu'
import { checkForUpdates } from '../services/updateService'

let lastTemplate: MenuItemConstructorOptions[] = []

/**
 * 菜单只作为快捷键与命令的入口：frameless 窗口不显示原生菜单栏，
 * 但 accelerator 依然生效，点击后统一转发给渲染进程执行。
 * 渲染进程的自绘菜单栏读取同一份模板（serializeAppMenu），避免两套菜单漂移。
 */
export function buildAppMenu(
  win: BrowserWindow,
  language: AppLanguage,
  spellcheck: boolean
): void {
  const label = (key: Parameters<typeof mainT>[1]): string => mainT(language, key)
  const cmd = (
    text: string,
    command: MenuCommandId,
    accelerator?: string
  ): MenuItemConstructorOptions => ({
    id: command,
    label: text,
    accelerator,
    click: () => win.webContents.send(CH.eventMenuCommand, { command })
  })

  const template: MenuItemConstructorOptions[] = [
    {
      label: label('menu.file'),
      submenu: [
        cmd(label('menu.new'), 'file.new', 'CmdOrCtrl+N'),
        cmd(label('menu.open'), 'file.open', 'CmdOrCtrl+O'),
        cmd(label('menu.openFolder'), 'file.openFolder', 'CmdOrCtrl+Shift+O'),
        cmd(label('menu.quickOpen'), 'file.quickOpen', 'CmdOrCtrl+P'),
        { type: 'separator' },
        cmd(label('menu.save'), 'file.save', 'CmdOrCtrl+S'),
        cmd(label('menu.saveAs'), 'file.saveAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        cmd(label('menu.closeTab'), 'file.closeTab', 'CmdOrCtrl+W'),
        cmd(label('menu.print'), 'file.print', 'CmdOrCtrl+Shift+P'),
        {
          label: label('menu.export'),
          submenu: [
            cmd(label('export.html'), 'export.html'),
            cmd(label('export.pdf'), 'export.pdf'),
            cmd(label('export.png'), 'export.png'),
            { type: 'separator' },
            cmd(label('export.docx'), 'export.docx'),
            cmd(label('export.latex'), 'export.latex'),
            cmd(label('export.epub'), 'export.epub')
          ]
        },
        { type: 'separator' },
        cmd(label('menu.preferences'), 'app.preferences', 'CmdOrCtrl+,'),
        { label: label('menu.quit'), role: 'quit' }
      ]
    },
    {
      label: label('menu.edit'),
      submenu: [
        cmd(label('menu.undo'), 'edit.undo', 'CmdOrCtrl+Z'),
        cmd(label('menu.redo'), 'edit.redo', 'CmdOrCtrl+Y'),
        { type: 'separator' },
        { label: label('menu.cut'), role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { label: label('menu.copy'), role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { label: label('menu.paste'), role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { label: label('menu.selectAll'), role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
        { type: 'separator' },
        cmd(label('menu.find'), 'edit.find', 'CmdOrCtrl+F'),
        cmd(label('menu.replace'), 'edit.replace', 'CmdOrCtrl+H'),
        { type: 'separator' },
        {
          id: 'spellcheck.toggle',
          label: label('menu.spellcheck'),
          type: 'checkbox',
          checked: spellcheck,
          click: () => win.webContents.send(CH.eventMenuCommand, { command: 'spellcheck.toggle' })
        }
      ]
    },
    {
      label: label('menu.paragraph'),
      submenu: [
        cmd(label('menu.heading1'), 'paragraph.heading1', 'CmdOrCtrl+1'),
        cmd(label('menu.heading2'), 'paragraph.heading2', 'CmdOrCtrl+2'),
        cmd(label('menu.heading3'), 'paragraph.heading3', 'CmdOrCtrl+3'),
        cmd(label('menu.heading4'), 'paragraph.heading4', 'CmdOrCtrl+4'),
        cmd(label('menu.heading5'), 'paragraph.heading5', 'CmdOrCtrl+5'),
        cmd(label('menu.heading6'), 'paragraph.heading6', 'CmdOrCtrl+6'),
        cmd(label('menu.paragraphText'), 'paragraph.paragraph', 'CmdOrCtrl+0'),
        { type: 'separator' },
        cmd(label('menu.quote'), 'paragraph.quote', 'CmdOrCtrl+Shift+Q'),
        cmd(label('menu.orderedList'), 'paragraph.orderedList', 'CmdOrCtrl+Shift+['),
        cmd(label('menu.bulletList'), 'paragraph.bulletList', 'CmdOrCtrl+Shift+]'),
        cmd(label('menu.taskList'), 'paragraph.taskList', 'CmdOrCtrl+Shift+X'),
        { type: 'separator' },
        cmd(label('menu.table'), 'paragraph.table', 'CmdOrCtrl+T'),
        cmd(label('menu.codeFence'), 'paragraph.codeFence', 'CmdOrCtrl+Shift+K'),
        cmd(label('menu.mathBlock'), 'paragraph.mathBlock', 'CmdOrCtrl+Shift+M'),
        cmd(label('menu.hr'), 'paragraph.hr')
      ]
    },
    {
      label: label('menu.format'),
      submenu: [
        cmd(label('menu.bold'), 'format.bold', 'CmdOrCtrl+B'),
        cmd(label('menu.italic'), 'format.italic', 'CmdOrCtrl+I'),
        cmd(label('menu.strike'), 'format.strike', 'Alt+Shift+5'),
        cmd(label('menu.inlineCode'), 'format.inlineCode', 'CmdOrCtrl+Shift+`'),
        cmd(label('menu.hyperlink'), 'format.hyperlink', 'CmdOrCtrl+K'),
        cmd(label('menu.image'), 'format.image', 'CmdOrCtrl+Shift+I')
      ]
    },
    {
      label: label('menu.view'),
      submenu: [
        cmd(label('menu.sourceCode'), 'view.sourceCode', 'CmdOrCtrl+/'),
        { type: 'separator' },
        cmd(label('menu.focusMode'), 'view.focusMode', 'F8'),
        cmd(label('menu.typewriter'), 'view.typewriter', 'F9'),
        { type: 'separator' },
        cmd(label('menu.sidebar'), 'view.toggleSidebar', 'CmdOrCtrl+Shift+L'),
        cmd(label('menu.outline'), 'view.toggleOutline', 'CmdOrCtrl+Shift+1'),
        { type: 'separator' },
        cmd(label('menu.zoomIn'), 'view.zoomIn', 'CmdOrCtrl+Shift+='),
        cmd(label('menu.zoomOut'), 'view.zoomOut', 'CmdOrCtrl+Shift+-'),
        cmd(label('menu.resetZoom'), 'view.resetZoom', 'CmdOrCtrl+Shift+0'),
        { type: 'separator' },
        cmd(label('menu.fullscreen'), 'view.fullscreen', 'F11'),
        { type: 'separator' },
        {
          label: label('menu.language'),
          submenu: [
            {
              id: 'lang.zh',
              label: label('menu.languageZh'),
              type: 'radio',
              checked: language === 'zh',
              click: () => win.webContents.send(CH.eventMenuCommand, { command: 'lang.zh' })
            },
            {
              id: 'lang.en',
              label: label('menu.languageEn'),
              type: 'radio',
              checked: language === 'en',
              click: () => win.webContents.send(CH.eventMenuCommand, { command: 'lang.en' })
            }
          ]
        }
      ]
    },
    {
      label: label('menu.theme'),
      submenu: [
        cmd(label('menu.themeLight'), 'theme.light'),
        cmd(label('menu.themeDark'), 'theme.dark'),
        cmd(label('menu.themeSystem'), 'theme.toggle')
      ]
    },
    {
      label: label('menu.help'),
      submenu: [
        {
          id: 'help.checkUpdates',
          label: label('menu.checkUpdates'),
          click: () => {
            void checkForUpdates({ manual: true })
          }
        },
        { type: 'separator' },
        cmd(label('menu.about'), 'app.about')
      ]
    }
  ]

  lastTemplate = template
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** 把当前模板序列化给渲染进程的自绘菜单栏；label 已按当前语言生成 */
export function serializeAppMenu(): AppMenuItem[] {
  const walk = (items: MenuItemConstructorOptions[]): AppMenuItem[] =>
    items.map((item) => {
      if (item.type === 'separator') return { type: 'separator' }
      const submenu = Array.isArray(item.submenu) ? item.submenu : null
      return {
        label: item.label,
        type: submenu
          ? 'submenu'
          : item.type === 'checkbox' || item.type === 'radio'
            ? item.type
            : 'normal',
        accelerator: typeof item.accelerator === 'string' ? item.accelerator : undefined,
        checked: item.checked,
        enabled: item.enabled,
        role: item.role,
        command: item.id as MenuCommandId | undefined,
        submenu: submenu ? walk(submenu) : undefined
      }
    })
  return walk(lastTemplate)
}
