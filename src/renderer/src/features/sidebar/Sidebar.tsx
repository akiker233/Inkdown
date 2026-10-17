import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { TreeNode } from '@shared/types/workspace'
import { baseName, dirName, isSamePath, joinPath } from '../../app/paths'
import { activeTabOf, useEditorStore } from '../../app/store/editorStore'
import { ChevronIcon, CloseIcon, FileIcon, FolderIcon, PlusIcon, RefreshIcon } from '../../components/icons'
import { PromptDialog, type PromptRequest } from '../../components/PromptDialog'
import { useI18n } from '../../i18n'
import { OutlinePanel } from '../outline/OutlinePanel'

interface Row {
  node: TreeNode
  depth: number
}

interface MenuState {
  x: number
  y: number
  node: TreeNode | null
}

function flattenChildren(node: TreeNode, expanded: Set<string>, depth: number, out: Row[]): void {
  for (const child of node.children ?? []) {
    out.push({ node: child, depth })
    if (child.kind === 'dir' && expanded.has(child.path)) {
      flattenChildren(child, expanded, depth + 1, out)
    }
  }
}

function findAncestors(node: TreeNode, target: string, trail: string[]): string[] | null {
  if (node.kind === 'file') return isSamePath(node.path, target) ? trail : null
  const next = [...trail, node.path]
  for (const child of node.children ?? []) {
    const found = findAncestors(child, target, next)
    if (found) return found
  }
  return null
}

export function Sidebar() {
  const { t } = useI18n()
  const root = useEditorStore((s) => s.workspace.root)
  const tree = useEditorStore((s) => s.workspace.tree)
  const loading = useEditorStore((s) => s.workspace.loading)
  const activePath = useEditorStore((s) => activeTabOf(s)?.path ?? null)
  const sidebarView = useEditorStore((s) => s.sidebarView)

  const setSidebarView = useEditorStore((s) => s.setSidebarView)
  const openWorkspaceDialog = useEditorStore((s) => s.openWorkspaceDialog)
  const closeWorkspace = useEditorStore((s) => s.closeWorkspace)
  const refreshTree = useEditorStore((s) => s.refreshTree)
  const openPath = useEditorStore((s) => s.openPath)
  const createNode = useEditorStore((s) => s.createNode)
  const renameNode = useEditorStore((s) => s.renameNode)
  const deleteNode = useEditorStore((s) => s.deleteNode)
  const revealNode = useEditorStore((s) => s.revealNode)

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [prompt, setPrompt] = useState<PromptRequest | null>(null)

  useEffect(() => {
    setExpanded(new Set())
  }, [root])

  useEffect(() => {
    setMenu(null)
  }, [sidebarView])

  // 激活标签对应的文件若在树里，自动展开它的各级父目录
  useEffect(() => {
    if (!tree || !activePath) return
    const trail = findAncestors(tree, activePath, [])
    if (!trail || trail.length === 0) return
    setExpanded((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const path of trail) {
        if (!next.has(path)) {
          next.add(path)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [tree, activePath])

  const rows = useMemo(() => {
    if (!tree) return []
    const out: Row[] = []
    flattenChildren(tree, expanded, 0, out)
    return out
  }, [tree, expanded])

  const toggleDir = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const openMenu = (event: MouseEvent, node: TreeNode | null): void => {
    event.preventDefault()
    event.stopPropagation()
    const width = 184
    const height = node ? 210 : 220
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - width - 8),
      y: Math.min(event.clientY, window.innerHeight - height - 8),
      node
    })
  }

  const startCreate = (dir: string | null, kind: 'file' | 'dir'): void => {
    if (!dir) return
    setMenu(null)
    setPrompt({
      title: t(kind === 'file' ? 'prompt.newFile' : 'prompt.newFolder'),
      initialValue: '',
      placeholder: t(kind === 'file' ? 'prompt.fileName' : 'prompt.folderName'),
      confirmText: t('prompt.create'),
      onConfirm: async (value) => {
        const created = await createNode(dir, value, kind)
        if (!created) return false
        if (kind === 'dir') {
          setExpanded((prev) => new Set(prev).add(created))
        }
        return true
      }
    })
  }

  const startRename = (node: TreeNode): void => {
    setMenu(null)
    setPrompt({
      title: t('prompt.renameTitle'),
      initialValue: node.name,
      confirmText: t('prompt.rename'),
      onConfirm: async (value) => {
        if (value === node.name) return true
        return renameNode(node.path, joinPath(dirName(node.path), value))
      }
    })
  }

  const removeNode = (node: TreeNode): void => {
    setMenu(null)
    void deleteNode(node.path)
  }

  const reveal = (node: TreeNode | null): void => {
    setMenu(null)
    const target = node?.path ?? root
    if (target) void revealNode(target)
  }

  const menuNode = menu?.node ?? null
  const menuDir = menuNode ? (menuNode.kind === 'dir' ? menuNode.path : dirName(menuNode.path)) : root

  const menuItem = (label: string, action: () => void, danger = false) => (
    <button
      type="button"
      className={danger ? 'context-menu__item is-danger' : 'context-menu__item'}
      onClick={action}
    >
      {label}
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span
          className="sidebar__title"
          title={sidebarView === 'outline' ? t('sidebar.outline') : (root ?? undefined)}
        >
          {sidebarView === 'outline'
            ? t('sidebar.outline')
            : root
              ? baseName(root)
              : t('sidebar.workspace')}
        </span>
        {sidebarView === 'files' ? (
          <>
            <button
              type="button"
              className="icon-btn"
              title={t('sidebar.newFile')}
              aria-label={t('sidebar.newFile')}
              disabled={!root}
              onClick={() => startCreate(root, 'file')}
            >
              <PlusIcon size={14} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title={t('sidebar.refresh')}
              aria-label={t('sidebar.refresh')}
              disabled={!root}
              onClick={() => void refreshTree()}
            >
              <RefreshIcon size={14} />
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="icon-btn"
          title={t(sidebarView === 'files' && root ? 'sidebar.closeFolder' : 'sidebar.hide')}
          aria-label={t(sidebarView === 'files' && root ? 'sidebar.closeFolder' : 'sidebar.hide')}
          onClick={() =>
            sidebarView === 'files' && root
              ? closeWorkspace()
              : useEditorStore.getState().toggleSidebar()
          }
        >
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="sidebar__tabs" role="tablist" aria-label={t('sidebar.view')}>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarView === 'files'}
          className={sidebarView === 'files' ? 'sidebar__tab is-active' : 'sidebar__tab'}
          onClick={() => setSidebarView('files')}
        >
          {t('sidebar.filesTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sidebarView === 'outline'}
          className={sidebarView === 'outline' ? 'sidebar__tab is-active' : 'sidebar__tab'}
          onClick={() => setSidebarView('outline')}
        >
          {t('sidebar.outlineTab')}
        </button>
      </div>

      {sidebarView === 'outline' ? <OutlinePanel /> : (
      <div
        className="sidebar__body"
        onContextMenu={(event) => {
          if (!root) return
          if (event.target === event.currentTarget) openMenu(event, null)
        }}
      >
        {!root ? (
          <div className="sidebar__empty">
            <p>{t('sidebar.openFolderHint')}</p>
            <button type="button" className="btn" onClick={() => void openWorkspaceDialog()}>
              {t('sidebar.openFolder')}
            </button>
          </div>
        ) : loading && !tree ? (
          <div className="sidebar__empty">{t('sidebar.loading')}</div>
        ) : rows.length === 0 ? (
          <div className="sidebar__empty">
            <p>{t('sidebar.empty')}</p>
            <button type="button" className="btn" onClick={() => startCreate(root, 'file')}>
              {t('sidebar.newHere')}
            </button>
          </div>
        ) : (
          rows.map(({ node, depth }) => {
            const isDir = node.kind === 'dir'
            const isOpen = isDir && expanded.has(node.path)
            const isActive = !isDir && activePath !== null && isSamePath(node.path, activePath)
            return (
              <button
                key={node.path}
                type="button"
                className={isActive ? 'tree-row is-active' : 'tree-row'}
                style={{ paddingLeft: 8 + depth * 12 }}
                title={node.path}
                onClick={() => {
                  if (isDir) toggleDir(node.path)
                  else void openPath(node.path)
                }}
                onContextMenu={(event) => openMenu(event, node)}
              >
                <span className={isDir ? `tree-row__chevron${isOpen ? ' is-open' : ''}` : 'tree-row__chevron'}>
                  {isDir ? <ChevronIcon size={12} /> : null}
                </span>
                <span className="tree-row__icon">
                  {isDir ? <FolderIcon size={14} /> : <FileIcon size={14} />}
                </span>
                <span className="tree-row__name">{node.name}</span>
              </button>
            )
          })
        )}
      </div>
      )}

      {menu
        ? createPortal(
            <div
              className="context-layer"
              onMouseDown={() => setMenu(null)}
              onContextMenu={(event) => {
                event.preventDefault()
                setMenu(null)
              }}
            >
              <div
                className="context-menu"
                style={{ left: menu.x, top: menu.y }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                {menuNode?.kind === 'file' ? (
                  menuItem(t('tree.open'), () => {
                    setMenu(null)
                    void openPath(menuNode.path)
                  })
                ) : (
                  <>
                    {menuItem(t('tree.newFile'), () => startCreate(menuDir, 'file'))}
                    {menuItem(t('tree.newFolder'), () => startCreate(menuDir, 'dir'))}
                  </>
                )}
                <div className="context-menu__sep" />
                {menuNode
                  ? menuItem(t('tree.rename'), () => startRename(menuNode))
                  : menuItem(t('tree.refresh'), () => {
                      setMenu(null)
                      void refreshTree()
                    })}
                {menuNode ? menuItem(t('tree.delete'), () => removeNode(menuNode), true) : null}
                <div className="context-menu__sep" />
                {menuItem(t('tree.reveal'), () => reveal(menuNode))}
                {!menuNode && root
                  ? menuItem(t('tree.closeFolder'), () => {
                      setMenu(null)
                      closeWorkspace()
                    })
                  : null}
              </div>
            </div>,
            document.body
          )
        : null}

      {prompt ? <PromptDialog request={prompt} onClose={() => setPrompt(null)} /> : null}
    </aside>
  )
}
