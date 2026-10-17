import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppMenuItem } from '@shared/types/menu'
import { useEditorStore } from '../../app/store/editorStore'
import { executeMenuCommand } from '../../app/useAppCommands'
import { OpenIcon, PlusIcon, SaveAsIcon, SaveIcon } from '../../components/icons'
import { selectAllCommand } from '../../editor/commands'
import { useI18n } from '../../i18n'

function formatAccelerator(accelerator?: string): string {
  return accelerator ? accelerator.replace('CmdOrCtrl', 'Ctrl') : ''
}

async function runItem(item: AppMenuItem): Promise<void> {
  if (item.command) {
    await executeMenuCommand(item.command)
    return
  }
  switch (item.role) {
    case 'cut':
      await window.api.app.editAction('cut')
      break
    case 'copy':
      await window.api.app.editAction('copy')
      break
    case 'paste':
      await window.api.app.editAction('paste')
      break
    case 'selectAll':
      selectAllCommand()
      break
    case 'quit':
      await window.api.window.close()
      break
  }
}

interface DropdownProps {
  items: AppMenuItem[]
  nested?: boolean
  onAction: (item: AppMenuItem) => void
}

function Dropdown({ items, nested = false, onAction }: DropdownProps) {
  const [openSub, setOpenSub] = useState<number | null>(null)

  return (
    <div
      className={nested ? 'menubar__dropdown menubar__dropdown--nested' : 'menubar__dropdown'}
      role="menu"
    >
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <div key={index} className="menubar__separator" role="separator" />
        }

        if (item.submenu) {
          return (
            <div
              key={index}
              className="menubar__submenu"
              onMouseEnter={() => setOpenSub(index)}
              onMouseLeave={() => setOpenSub((current) => (current === index ? null : current))}
            >
              <button
                type="button"
                className="menubar__item"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={openSub === index}
                onClick={() => setOpenSub(index)}
              >
                <span className="menubar__check" />
                <span className="menubar__label">{item.label}</span>
                <span className="menubar__chevron">›</span>
              </button>
              {openSub === index ? (
                <Dropdown items={item.submenu} nested onAction={onAction} />
              ) : null}
            </div>
          )
        }

        const checked =
          item.type === 'checkbox' || item.type === 'radio' ? item.checked : undefined

        return (
          <button
            key={index}
            type="button"
            className="menubar__item"
            role={
              item.type === 'checkbox'
                ? 'menuitemcheckbox'
                : item.type === 'radio'
                  ? 'menuitemradio'
                  : 'menuitem'
            }
            aria-checked={checked}
            onClick={() => onAction(item)}
          >
            <span className="menubar__check">{checked ? '✓' : ''}</span>
            <span className="menubar__label">{item.label}</span>
            {item.accelerator ? (
              <span className="menubar__accel">{formatAccelerator(item.accelerator)}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function MenuBar() {
  const { t } = useI18n()
  const language = useEditorStore((s) => s.language)
  const hasTabs = useEditorStore((s) => s.tabs.length > 0)
  const [menus, setMenus] = useState<AppMenuItem[]>([])
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setMenus(await window.api.app.getMenu())
    } catch {
      // 主进程尚未就绪时保持空菜单，下次展开会重试
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, language])

  useEffect(() => {
    if (openIndex === null) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenIndex(null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenIndex(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openIndex])

  const activate = (item: AppMenuItem): void => {
    setOpenIndex(null)
    void runItem(item)
  }

  const openMenu = (index: number): void => {
    if (openIndex === index) {
      setOpenIndex(null)
      return
    }
    setOpenIndex(index)
    void load()
  }

  const quick = (command: 'file.new' | 'file.open' | 'file.save' | 'file.saveAs'): void => {
    setOpenIndex(null)
    void executeMenuCommand(command)
  }

  return (
    <div className="menubar" ref={rootRef}>
      <div className="menubar__menus">
        {menus.map((menu, index) => (
          <div key={index} className="menubar__menu">
            <button
              type="button"
              className={openIndex === index ? 'menubar__trigger is-open' : 'menubar__trigger'}
              aria-haspopup="menu"
              aria-expanded={openIndex === index}
              onClick={() => openMenu(index)}
              onMouseEnter={() => {
                if (openIndex !== null && openIndex !== index) openMenu(index)
              }}
            >
              {menu.label}
            </button>
            {openIndex === index && menu.submenu ? (
              <Dropdown items={menu.submenu} onAction={activate} />
            ) : null}
          </div>
        ))}
      </div>

      <div className="menubar__spacer" />

      <div className="menubar__quick">
        <button
          type="button"
          className="icon-btn"
          title={t('title.new')}
          aria-label={t('title.new')}
          onClick={() => quick('file.new')}
        >
          <PlusIcon size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('title.open')}
          aria-label={t('title.open')}
          onClick={() => quick('file.open')}
        >
          <OpenIcon size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('title.save')}
          aria-label={t('title.save')}
          disabled={!hasTabs}
          onClick={() => quick('file.save')}
        >
          <SaveIcon size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={t('title.saveAs')}
          aria-label={t('title.saveAs')}
          disabled={!hasTabs}
          onClick={() => quick('file.saveAs')}
        >
          <SaveAsIcon size={15} />
        </button>
      </div>
    </div>
  )
}
