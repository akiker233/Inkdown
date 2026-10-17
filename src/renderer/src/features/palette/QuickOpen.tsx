import Fuse from 'fuse.js'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { TreeNode } from '@shared/types/workspace'
import { baseName, MD_EXT_RE } from '../../app/paths'
import { useEditorStore } from '../../app/store/editorStore'
import { SearchIcon } from '../../components/icons'
import { useI18n } from '../../i18n'

interface FileItem {
  path: string
  label: string
}

function flattenFiles(node: TreeNode, out: FileItem[]): void {
  if (node.kind === 'file') {
    if (MD_EXT_RE.test(node.path)) out.push({ path: node.path, label: node.name })
    return
  }
  for (const child of node.children ?? []) flattenFiles(child, out)
}

export function QuickOpen() {
  const { t } = useI18n()
  const open = useEditorStore((s) => s.paletteOpen)
  const tree = useEditorStore((s) => s.workspace.tree)
  const root = useEditorStore((s) => s.workspace.root)
  const recentFiles = useEditorStore((s) => s.recentFiles)

  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const files = useMemo<FileItem[]>(() => {
    if (tree && root) {
      const out: FileItem[] = []
      flattenFiles(tree, out)
      return out.map((item) => ({
        ...item,
        label: item.path.slice(root.length).replace(/^[\\/]/, '')
      }))
    }
    return recentFiles.map((path) => ({ path, label: path }))
  }, [tree, root, recentFiles])

  const results = useMemo(() => {
    const keyword = query.trim()
    if (!keyword) return files.slice(0, 50)
    const fuse = new Fuse(files, {
      keys: ['label', 'path'],
      threshold: 0.4,
      ignoreLocation: true
    })
    return fuse.search(keyword).slice(0, 50).map((result) => result.item)
  }, [files, query])

  useEffect(() => setIndex(0), [query])

  useEffect(() => {
    const active = listRef.current?.querySelector('.palette__item.is-active')
    active?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null

  const close = (): void => {
    useEditorStore.getState().setPaletteOpen(false)
    // 关闭后把焦点还给编辑器，避免接下来敲键盘没反应
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.cm-content')?.focus()
    })
  }

  const choose = (path: string): void => {
    close()
    void useEditorStore.getState().openPath(path)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex((value) => Math.min(value + 1, Math.max(results.length - 1, 0)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex((value) => Math.max(value - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const item = results[index]
      if (item) choose(item.path)
    }
  }

  return createPortal(
    <div className="palette-layer" onMouseDown={close}>
      <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette__input-row">
          <SearchIcon size={15} />
          <input
            ref={inputRef}
            value={query}
            spellCheck={false}
            placeholder={t(root ? 'palette.workspacePlaceholder' : 'palette.recentPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="palette__results" ref={listRef}>
          {results.length === 0 ? (
            <div className="palette__empty">
              {t(files.length === 0 ? 'palette.noFiles' : 'palette.noMatch')}
            </div>
          ) : (
            results.map((item, itemIndex) => (
              <button
                key={item.path}
                type="button"
                className={itemIndex === index ? 'palette__item is-active' : 'palette__item'}
                onMouseEnter={() => setIndex(itemIndex)}
                onClick={() => choose(item.path)}
              >
                <span className="palette__name">{baseName(item.path)}</span>
                <span className="palette__path">{item.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
