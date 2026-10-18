import type { ReactNode } from 'react'
import type { MenuCommandId } from '@shared/types/menu'
import { executeMenuCommand } from '../../app/useAppCommands'
import {
  BulletListIcon,
  CodeBlockIcon,
  HighlighterIcon,
  HrIcon,
  ImageIcon,
  InlineCodeIcon,
  LinkIcon,
  MathIcon,
  OrderedListIcon,
  QuoteIcon,
  RedoIcon,
  TableIcon,
  TaskListIcon,
  UndoIcon
} from '../../components/icons'
import { useI18n } from '../../i18n'

interface ToolButtonProps {
  label: string
  onClick: () => void
  children: ReactNode
  className?: string
}

/** 按下时阻止默认行为，避免编辑器失焦丢掉选区 */
function ToolButton({ label, onClick, children, className }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={className ? `format-btn ${className}` : 'format-btn'}
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function FormatToolbar() {
  const { t } = useI18n()

  const run = (command: MenuCommandId) => (): void => {
    void executeMenuCommand(command)
  }

  return (
    <div className="format-toolbar" role="toolbar" aria-label={t('toolbar.label')}>
      <div className="format-toolbar__group">
        <ToolButton label={t('toolbar.image')} onClick={run('format.image')}>
          <ImageIcon size={16} />
        </ToolButton>
      </div>

      <span className="format-toolbar__sep" aria-hidden="true" />

      <div className="format-toolbar__group">
        <ToolButton
          label={t('toolbar.h1')}
          className="format-btn--text"
          onClick={run('paragraph.heading1')}
        >
          H1
        </ToolButton>
        <ToolButton
          label={t('toolbar.h2')}
          className="format-btn--text"
          onClick={run('paragraph.heading2')}
        >
          H2
        </ToolButton>
        <ToolButton
          label={t('toolbar.h3')}
          className="format-btn--text"
          onClick={run('paragraph.heading3')}
        >
          H3
        </ToolButton>
        <ToolButton
          label={t('toolbar.h4')}
          className="format-btn--text"
          onClick={run('paragraph.heading4')}
        >
          H4
        </ToolButton>
        <ToolButton
          label={t('toolbar.h5')}
          className="format-btn--text"
          onClick={run('paragraph.heading5')}
        >
          H5
        </ToolButton>
        <ToolButton
          label={t('toolbar.h6')}
          className="format-btn--text"
          onClick={run('paragraph.heading6')}
        >
          H6
        </ToolButton>
        <ToolButton
          label={t('toolbar.paragraph')}
          className="format-btn--text"
          onClick={run('paragraph.paragraph')}
        >
          {t('toolbar.paragraph')}
        </ToolButton>
      </div>

      <span className="format-toolbar__sep" aria-hidden="true" />

      <div className="format-toolbar__group">
        <ToolButton label={t('toolbar.bold')} onClick={run('format.bold')}>
          <span className="format-btn__bold">B</span>
        </ToolButton>
        <ToolButton label={t('toolbar.italic')} onClick={run('format.italic')}>
          <span className="format-btn__italic">I</span>
        </ToolButton>
        <ToolButton label={t('toolbar.strike')} onClick={run('format.strike')}>
          <span className="format-btn__strike">S</span>
        </ToolButton>
        <ToolButton label={t('toolbar.highlight')} onClick={run('format.highlight')}>
          <HighlighterIcon size={16} />
        </ToolButton>
        <ToolButton label={t('toolbar.inlineCode')} onClick={run('format.inlineCode')}>
          <InlineCodeIcon size={16} />
        </ToolButton>
      </div>

      <span className="format-toolbar__sep" aria-hidden="true" />

      <div className="format-toolbar__group">
        <ToolButton label={t('toolbar.taskList')} onClick={run('paragraph.taskList')}>
          <TaskListIcon size={16} />
        </ToolButton>
        <ToolButton label={t('toolbar.bulletList')} onClick={run('paragraph.bulletList')}>
          <BulletListIcon size={16} />
        </ToolButton>
        <ToolButton label={t('toolbar.orderedList')} onClick={run('paragraph.orderedList')}>
          <OrderedListIcon size={16} />
        </ToolButton>
        <ToolButton label={t('toolbar.quote')} onClick={run('paragraph.quote')}>
          <QuoteIcon size={16} />
        </ToolButton>
      </div>

      <span className="format-toolbar__sep" aria-hidden="true" />

      <div className="format-toolbar__group">
        <ToolButton label={t('toolbar.link')} onClick={run('format.hyperlink')}>
          <LinkIcon size={16} />
        </ToolButton>
        <ToolButton label={t('toolbar.table')} onClick={run('paragraph.table')}>
          <TableIcon size={16} />
        </ToolButton>
        <ToolButton label={t('toolbar.codeBlock')} onClick={run('paragraph.codeFence')}>
          <CodeBlockIcon size={16} />
        </ToolButton>
        <ToolButton label={t('toolbar.mathBlock')} onClick={run('paragraph.mathBlock')}>
          <MathIcon size={16} />
        </ToolButton>
        <ToolButton label={t('toolbar.hr')} onClick={run('paragraph.hr')}>
          <HrIcon size={16} />
        </ToolButton>
      </div>

      <div className="format-toolbar__group format-toolbar__group--history">
        <ToolButton label={t('toolbar.undo')} onClick={run('edit.undo')}>
          <UndoIcon size={16} />
        </ToolButton>
        <ToolButton label={t('toolbar.redo')} onClick={run('edit.redo')}>
          <RedoIcon size={16} />
        </ToolButton>
      </div>
    </div>
  )
}
