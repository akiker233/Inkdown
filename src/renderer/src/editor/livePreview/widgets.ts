import { EditorView, WidgetType } from '@codemirror/view'
import { GFM, parser } from '@lezer/markdown'
import katex from 'katex'
import { getLanguage, t } from '../../i18n'
import type { BlockWidgetPayload } from './blocks'
import { renderMermaid } from './mermaid'
import { collectInlineSpans, sourceOf, type InlineSpan, type SpanRange } from './spans'
import {
  cycleAlign,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  serializeTable,
  setAlign,
  type TableAlign,
  type TableModel
} from './tableModel'

/** 语言下拉的常用项；当前文档里的语言不在列表里时会临时补进去 */
const LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'plaintext' },
  { value: 'bash', label: 'bash' },
  { value: 'c', label: 'c' },
  { value: 'cpp', label: 'cpp' },
  { value: 'csharp', label: 'c#' },
  { value: 'css', label: 'css' },
  { value: 'diff', label: 'diff' },
  { value: 'go', label: 'go' },
  { value: 'html', label: 'html' },
  { value: 'java', label: 'java' },
  { value: 'javascript', label: 'javascript' },
  { value: 'json', label: 'json' },
  { value: 'jsx', label: 'jsx' },
  { value: 'kotlin', label: 'kotlin' },
  { value: 'markdown', label: 'markdown' },
  { value: 'php', label: 'php' },
  { value: 'python', label: 'python' },
  { value: 'ruby', label: 'ruby' },
  { value: 'rust', label: 'rust' },
  { value: 'scss', label: 'scss' },
  { value: 'shell', label: 'shell' },
  { value: 'sql', label: 'sql' },
  { value: 'swift', label: 'swift' },
  { value: 'toml', label: 'toml' },
  { value: 'typescript', label: 'typescript' },
  { value: 'tsx', label: 'tsx' },
  { value: 'xml', label: 'xml' },
  { value: 'yaml', label: 'yaml' }
]

function reveal(view: EditorView, pos: number): void {
  view.dispatch({ selection: { anchor: pos } })
  view.focus()
}

function sameRange(a: SpanRange, b: SpanRange): boolean {
  return a.from === b.from && a.to === b.to
}

class BulletWidget extends WidgetType {
  constructor(private readonly depth: number) {
    super()
  }

  eq(other: WidgetType): boolean {
    return other instanceof BulletWidget && other.depth === this.depth
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    const variant = (Math.max(this.depth, 1) - 1) % 3
    span.className = `md-bullet md-bullet-${variant}`
    span.textContent = variant === 0 ? '•' : variant === 1 ? '◦' : '▪'
    return span
  }
}

class TaskWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly marker: SpanRange
  ) {
    super()
  }

  private readonly lang = getLanguage()

  eq(other: WidgetType): boolean {
    return (
      other instanceof TaskWidget &&
      other.checked === this.checked &&
      other.lang === this.lang &&
      sameRange(other.marker, this.marker)
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'md-task'

    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.setAttribute(
      'aria-label',
      this.checked ? t('widget.taskDone') : t('widget.taskUndone')
    )

    input.addEventListener('mousedown', (event) => event.stopPropagation())
    input.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const { from, to } = this.marker
      const current = view.state.doc.sliceString(from, to)
      const next = /\[[xX]\]/.test(current) ? '[ ]' : '[x]'
      view.dispatch({ changes: { from, to, insert: next } })
      view.focus()
    })

    wrap.appendChild(input)
    return wrap
  }
}

class HrWidget extends WidgetType {
  constructor(private readonly source: SpanRange) {
    super()
  }

  eq(other: WidgetType): boolean {
    return other instanceof HrWidget && sameRange(other.source, this.source)
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'md-hr-widget'
    wrap.appendChild(document.createElement('hr'))
    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      reveal(view, this.source.from)
    })
    return wrap
  }
}

class ImageWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly rawSrc: string,
    private readonly alt: string,
    private readonly source: SpanRange
  ) {
    super()
  }

  private readonly lang = getLanguage()

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImageWidget &&
      other.src === this.src &&
      other.alt === this.alt &&
      other.lang === this.lang &&
      sameRange(other.source, this.source)
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'md-image-widget'

    const fallback = document.createElement('span')
    fallback.className = 'md-image-fallback'
    fallback.textContent = t('widget.imageFailed', { src: this.rawSrc })
    fallback.hidden = true

    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.draggable = false
    img.loading = 'lazy'
    img.addEventListener('error', () => {
      img.remove()
      fallback.hidden = false
      wrap.classList.add('is-error')
    })
    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      reveal(view, this.source.from)
    })

    wrap.append(img, fallback)
    return wrap
  }
}

class CodeHeaderWidget extends WidgetType {
  constructor(
    private readonly lang: string,
    private readonly info: SpanRange,
    private readonly code: SpanRange
  ) {
    super()
  }

  private readonly language = getLanguage()

  eq(other: WidgetType): boolean {
    return (
      other instanceof CodeHeaderWidget &&
      other.lang === this.lang &&
      other.language === this.language &&
      sameRange(other.info, this.info) &&
      sameRange(other.code, this.code)
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const bar = document.createElement('div')
    bar.className = 'md-code-header'

    const select = document.createElement('select')
    select.className = 'md-code-lang'
    select.setAttribute('aria-label', t('widget.codeLang'))
    const options = LANGUAGES.some((item) => item.value === this.lang)
      ? LANGUAGES
      : [...LANGUAGES, { value: this.lang, label: this.lang }]
    for (const item of options) {
      const option = document.createElement('option')
      option.value = item.value
      option.textContent = item.label
      select.appendChild(option)
    }
    select.value = this.lang
    select.addEventListener('mousedown', (event) => event.stopPropagation())
    select.addEventListener('change', () => {
      const { from, to } = this.info
      view.dispatch({ changes: { from, to, insert: select.value } })
      view.focus()
    })

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'md-code-copy'
    copy.textContent = t('widget.copy')
    copy.setAttribute('aria-label', t('widget.copyAria'))
    copy.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    copy.addEventListener('click', async (event) => {
      event.preventDefault()
      event.stopPropagation()
      const content = view.state.doc.sliceString(this.code.from, this.code.to)
      try {
        await window.api.app.copyText(content)
        copy.textContent = t('widget.copied')
        copy.classList.add('is-done')
        window.setTimeout(() => {
          copy.textContent = t('widget.copy')
          copy.classList.remove('is-done')
        }, 1200)
      } catch {
        copy.textContent = t('widget.copyFailed')
      }
    })

    bar.append(select, copy)
    return bar
  }
}

class LineNumberWidget extends WidgetType {
  constructor(private readonly number: number) {
    super()
  }

  eq(other: WidgetType): boolean {
    return other instanceof LineNumberWidget && other.number === this.number
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'md-code-lineno'
    span.textContent = String(this.number)
    span.setAttribute('aria-hidden', 'true')
    return span
  }
}

class MathWidget extends WidgetType {
  constructor(
    private readonly tex: string,
    private readonly display: boolean,
    private readonly source: SpanRange
  ) {
    super()
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof MathWidget &&
      other.tex === this.tex &&
      other.display === this.display &&
      sameRange(other.source, this.source)
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement(this.display ? 'div' : 'span')
    wrap.className = this.display ? 'md-math md-math-block' : 'md-math'
    try {
      katex.render(this.tex, wrap, {
        displayMode: this.display,
        throwOnError: false,
        strict: 'ignore',
        trust: false
      })
    } catch {
      wrap.classList.add('is-error')
      wrap.textContent = this.tex
    }
    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      reveal(view, this.source.from)
    })
    return wrap
  }
}

interface MermaidHost extends HTMLElement {
  __mermaidAlive?: () => void
}

class MermaidWidget extends WidgetType {
  private readonly key: string
  private readonly dark: boolean
  private readonly language = getLanguage()

  constructor(
    private readonly code: string,
    source: SpanRange,
    private readonly codeFrom: number
  ) {
    super()
    // 主题/语言变化会触发装饰重算：纳入 key，CM 才会换掉旧 DOM 并重建文案
    this.dark = document.documentElement.dataset.theme === 'dark'
    this.key = `${source.from}:${source.to}:${this.dark ? 'd' : 'l'}:${this.language}:${code}`
  }

  eq(other: WidgetType): boolean {
    return other instanceof MermaidWidget && other.key === this.key
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'md-mermaid-widget'
    wrap.title = t('widget.mermaidClick')

    const stage = document.createElement('div')
    stage.className = 'md-mermaid-stage'
    const status = document.createElement('div')
    status.className = 'md-mermaid-status'
    status.textContent = t('widget.mermaidRendering')
    stage.appendChild(status)
    wrap.appendChild(stage)

    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      reveal(view, this.codeFrom)
    })

    let alive = true
    const host = wrap as MermaidHost
    host.__mermaidAlive = () => {
      alive = false
    }

    void renderMermaid(this.code, this.dark)
      .then((svg) => {
        if (!alive) return
        stage.innerHTML = svg
        stage.classList.add('is-ready')
      })
      .catch((error: unknown) => {
        if (!alive) return
        wrap.classList.add('is-error')
        const message = error instanceof Error ? error.message : String(error)
        status.className = 'md-mermaid-error'
        status.textContent = ''
        const title = document.createElement('div')
        title.className = 'md-mermaid-error__title'
        title.textContent = t('widget.mermaidFailed')
        const detail = document.createElement('pre')
        detail.className = 'md-mermaid-error__detail'
        detail.textContent = message.split('\n').slice(0, 6).join('\n').slice(0, 400)
        const hint = document.createElement('div')
        hint.className = 'md-mermaid-error__hint'
        hint.textContent = t('widget.mermaidHint')
        status.append(title, detail, hint)
      })

    return wrap
  }

  destroy(dom: HTMLElement): void {
    ;(dom as MermaidHost).__mermaidAlive?.()
  }
}

class TableWidget extends WidgetType {
  private readonly key: string
  private readonly language = getLanguage()

  constructor(
    private readonly model: TableModel,
    private readonly cells: SpanRange[][],
    private readonly source: SpanRange
  ) {
    super()
    this.key = `${source.from}:${source.to}:${this.language}:${JSON.stringify(model)}`
  }

  eq(other: WidgetType): boolean {
    return other instanceof TableWidget && other.key === this.key
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'md-table-widget'

    const toolbar = document.createElement('div')
    toolbar.className = 'md-table-toolbar'
    toolbar.setAttribute('role', 'toolbar')
    toolbar.setAttribute('aria-label', t('widget.tableToolbar'))
    toolbar.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })

    let hoverRow = 0
    let hoverCol = 0

    const apply = (next: TableModel): void => {
      if (next === this.model) return
      view.dispatch({
        changes: {
          from: this.source.from,
          to: this.source.to,
          insert: serializeTable(next)
        }
      })
    }

    const addButton = (label: string, title: string): HTMLButtonElement => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'md-table-btn'
      button.textContent = label
      button.title = title
      button.setAttribute('aria-label', title)
      toolbar.appendChild(button)
      return button
    }

    const addRowButton = addButton(t('widget.addRow'), t('widget.addRowTip'))
    const removeRowButton = addButton(t('widget.removeRow'), t('widget.removeRowTip'))
    const addColumnButton = addButton(t('widget.addColumn'), t('widget.addColumnTip'))
    const removeColumnButton = addButton(t('widget.removeColumn'), t('widget.removeColumnTip'))
    const alignButton = addButton(t('widget.align'), t('widget.alignTip'))

    addColumnButton.addEventListener('click', () => {
      apply(insertColumn(this.model, hoverCol + 1))
    })

    const syncTarget = (row: number, col: number): void => {
      hoverRow = row
      hoverCol = col
      const align = this.model.aligns[col] ?? 'none'
      const label = alignLabel(align)
      alignButton.textContent = label
      alignButton.title = t('widget.alignCurrent', { value: label })
      removeRowButton.disabled = hoverRow < 1
      removeColumnButton.disabled = this.model.aligns.length <= 1
    }

    addRowButton.addEventListener('click', () => {
      apply(insertRow(this.model, hoverRow <= 0 ? 0 : hoverRow))
    })
    removeRowButton.addEventListener('click', () => {
      if (hoverRow >= 1) apply(deleteRow(this.model, hoverRow - 1))
    })
    removeColumnButton.addEventListener('click', () => {
      apply(deleteColumn(this.model, hoverCol))
    })
    alignButton.addEventListener('click', () => {
      const current = this.model.aligns[hoverCol] ?? 'none'
      apply(setAlign(this.model, hoverCol, cycleAlign(current)))
    })

    const scroll = document.createElement('div')
    scroll.className = 'md-table-scroll'
    const table = document.createElement('table')
    table.className = 'md-table'

    const head = table.createTHead()
    const headRow = head.insertRow()
    this.model.header.forEach((value, col) => {
      const cell = document.createElement('th')
      fillCell(cell, value)
      cell.dataset.row = '0'
      cell.dataset.col = String(col)
      cell.className = `md-table-align-${this.model.aligns[col] ?? 'none'}`
      headRow.appendChild(cell)
    })

    const body = table.createTBody()
    this.model.rows.forEach((row, rowIndex) => {
      const tr = body.insertRow()
      for (let col = 0; col < this.model.aligns.length; col += 1) {
        const cell = tr.insertCell()
        fillCell(cell, row[col] ?? '')
        cell.dataset.row = String(rowIndex + 1)
        cell.dataset.col = String(col)
        cell.className = `md-table-align-${this.model.aligns[col] ?? 'none'}`
      }
    })

    table.addEventListener('mouseover', (event) => {
      const cell = (event.target as HTMLElement).closest('td,th') as HTMLElement | null
      if (!cell || !table.contains(cell)) return
      syncTarget(Number(cell.dataset.row), Number(cell.dataset.col))
    })

    table.addEventListener('mousedown', (event) => {
      const cell = (event.target as HTMLElement).closest('td,th') as HTMLElement | null
      if (!cell || event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      const row = Number(cell.dataset.row)
      const col = Number(cell.dataset.col)
      const target = this.cells[row]?.[col]
      const pos = target ? Math.min(target.from, view.state.doc.length) : this.source.from
      // 点击单元格回到源码：表格进入激活态，编辑仍由 CodeMirror 统一承载
      view.dispatch({ selection: { anchor: pos } })
      view.focus()
    })

    scroll.appendChild(table)
    wrap.append(toolbar, scroll)
    syncTarget(0, 0)
    return wrap
  }
}

function alignLabel(align: TableAlign): string {
  if (align === 'left') return t('widget.alignLeft')
  if (align === 'center') return t('widget.alignCenter')
  if (align === 'right') return t('widget.alignRight')
  return t('widget.alignNone')
}

const cellParser = parser.configure(GFM)
const CELL_TAGS: Record<InlineSpan['kind'], string> = {
  strong: 'strong',
  em: 'em',
  strike: 'del',
  code: 'code',
  highlight: 'mark',
  link: 'span',
  autolink: 'span',
  wiki: 'span'
}

function displayCell(value: string): string {
  return value.replace(/\\\|/g, '|')
}

function renderCellContent(target: Node, value: string, spans: InlineSpan[], from: number, to: number): void {
  const inner = spans
    .filter((span) => span.from >= from && span.to <= to)
    .sort((a, b) => a.from - b.from || b.to - a.to)

  let cursor = from
  let coveredTo = from
  for (const span of inner) {
    if (span.from < coveredTo) continue
    if (span.from > cursor) {
      target.appendChild(document.createTextNode(displayCell(value.slice(cursor, span.from))))
    }
    const element = document.createElement(CELL_TAGS[span.kind])
    element.className = span.className
    if (span.kind === 'code') {
      element.textContent = value.slice(span.content.from, span.content.to)
    } else {
      renderCellContent(element, value, spans, span.content.from, span.content.to)
    }
    target.appendChild(element)
    cursor = span.to
    coveredTo = span.to
  }

  if (cursor < to) {
    target.appendChild(document.createTextNode(displayCell(value.slice(cursor, to))))
  }
}

function fillCell(cell: HTMLElement, value: string): void {
  const tree = cellParser.parse(value)
  const spans = collectInlineSpans({ tree, text: sourceOf(value), from: 0, to: value.length })
  if (spans.length === 0) {
    cell.textContent = displayCell(value)
    return
  }
  renderCellContent(cell, value, spans, 0, value.length)
}

export function renderBlockWidget(payload: BlockWidgetPayload): WidgetType {
  switch (payload.kind) {
    case 'bullet':
      return new BulletWidget(payload.depth)
    case 'task':
      return new TaskWidget(payload.checked, payload.marker)
    case 'hr':
      return new HrWidget(payload.source)
    case 'image':
      return new ImageWidget(payload.src, payload.rawSrc, payload.alt, payload.source)
    case 'code-header':
      return new CodeHeaderWidget(payload.lang, payload.info, payload.code)
    case 'code-lineno':
      return new LineNumberWidget(payload.number)
    case 'math':
      return new MathWidget(payload.tex, payload.display, payload.source)
    case 'table':
      return new TableWidget(payload.model, payload.cells, payload.source)
    case 'mermaid':
      return new MermaidWidget(payload.code, payload.source, payload.codeFrom)
  }
}
