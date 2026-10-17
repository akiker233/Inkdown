import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'

export interface PromptRequest {
  title: string
  initialValue: string
  placeholder?: string
  confirmText?: string
  /** 返回 false 表示失败，对话框保持打开，让用户修正输入 */
  onConfirm: (value: string) => Promise<boolean> | boolean
}

export function PromptDialog({
  request,
  onClose
}: {
  request: PromptRequest
  onClose: () => void
}) {
  const { t } = useI18n()
  const [value, setValue] = useState(request.initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    // 重命名时只选中主文件名，保留扩展名
    const dot = request.initialValue.lastIndexOf('.')
    if (dot > 0) input.setSelectionRange(0, dot)
    else input.select()
  }, [request])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    const ok = await request.onConfirm(trimmed)
    if (ok !== false) onClose()
  }

  return createPortal(
    <div className="modal-layer" onMouseDown={onClose}>
      <form
        className="modal modal--prompt"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <h2>{request.title}</h2>
        <input
          ref={inputRef}
          value={value}
          placeholder={request.placeholder}
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
        />
        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={!value.trim()}>
            {request.confirmText ?? t('common.confirm')}
          </button>
        </div>
      </form>
    </div>,
    document.body
  )
}
