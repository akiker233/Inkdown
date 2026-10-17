import { syntaxTree } from '@codemirror/language'
import { StateEffect, type Extension, type Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate
} from '@codemirror/view'
import {
  collectBlockDecorations,
  isRegionActive,
  type BlockDecoration
} from './blocks'
import { docPathField, setDocPath } from './docPath'
import { collectMathItems, type MathItem } from './math'
import {
  buildDecorationSpecs,
  collectInlineSpans,
  type InlineSpan,
  type SpanRange,
  type TextSource
} from './spans'
import { renderBlockWidget } from './widgets'

/** 视口上下各多算 200 行，滚动时不会看到装饰"追上来" */
const VIEWPORT_MARGIN_LINES = 200

/** 主题等不影响文档的配置变化后，主动要求装饰重算（Mermaid 等 widget 需要重建） */
export const refreshDecorationsEffect = StateEffect.define<null>()

function visibleRanges(view: EditorView): SpanRange[] {
  const doc = view.state.doc
  const raw = view.visibleRanges
  const source: SpanRange[] =
    raw.length > 0
      ? raw.map((range) => ({ from: range.from, to: range.to }))
      : [{ from: 0, to: doc.line(Math.min(doc.lines, VIEWPORT_MARGIN_LINES)).to }]

  const expanded = source
    .map((range) => {
      const start = Math.max(1, doc.lineAt(range.from).number - VIEWPORT_MARGIN_LINES)
      const end = Math.min(doc.lines, doc.lineAt(range.to).number + VIEWPORT_MARGIN_LINES)
      return { from: doc.line(start).from, to: doc.line(end).to }
    })
    .sort((a, b) => a.from - b.from)

  const merged: SpanRange[] = []
  for (const range of expanded) {
    const last = merged[merged.length - 1]
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to)
    else merged.push({ ...range })
  }
  return merged
}

function textSource(view: EditorView): TextSource {
  const doc = view.state.doc
  return {
    length: doc.length,
    slice: (from, to) => doc.sliceString(Math.max(0, from), Math.min(doc.length, to))
  }
}

function intersects(a: SpanRange, b: SpanRange): boolean {
  return a.from < b.to && a.to > b.from
}

function selectionRanges(view: EditorView): SpanRange[] {
  return view.state.selection.ranges.map((range) => ({ from: range.from, to: range.to }))
}

function toDecoration(spec: BlockDecoration): Range<Decoration> {
  if (spec.kind === 'line') {
    return Decoration.line({ class: spec.className }).range(spec.from)
  }
  if (spec.kind === 'mark') {
    return Decoration.mark({ class: spec.className }).range(spec.from, spec.to)
  }
  if (spec.kind === 'widget') {
    if (!spec.widget) throw new Error('widget decoration 缺少 payload')
    return Decoration.widget({
      widget: renderBlockWidget(spec.widget),
      side: spec.side ?? -1
    }).range(spec.from)
  }
  return Decoration.replace({
    widget: spec.widget ? renderBlockWidget(spec.widget) : undefined,
    block: spec.block ?? false
  }).range(spec.from, spec.to)
}

class LivePreviewValue {
  decorations: DecorationSet = Decoration.none
  atomic: DecorationSet = Decoration.none
  private composing = false

  constructor(view: EditorView) {
    this.rebuild(view)
  }

  update(update: ViewUpdate): void {
    // IME 冻结：合成期间不重建装饰，只把旧装饰随文档变化映射平移。
    // 否则中文输入法正在组合的那一行可能出现 replace 越界，直接拖垮渲染管线。
    if (update.view.composing) {
      this.composing = true
      if (update.docChanged) {
        this.decorations = this.decorations.map(update.changes)
        this.atomic = this.atomic.map(update.changes)
      }
      return
    }
    if (this.composing) {
      this.composing = false
      this.rebuild(update.view)
      return
    }

    const pathChanged = update.transactions.some((tr) =>
      tr.effects.some((effect) => effect.is(setDocPath))
    )
    const refreshed = update.transactions.some((tr) =>
      tr.effects.some((effect) => effect.is(refreshDecorationsEffect))
    )
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.selectionSet ||
      pathChanged ||
      refreshed
    ) {
      this.rebuild(update.view)
    }
  }

  private rebuild(view: EditorView): void {
    const ranges = visibleRanges(view)
    const tree = syntaxTree(view.state)
    const text = textSource(view)
    const selection = selectionRanges(view)
    const docPath = view.state.field(docPathField, false) ?? ''

    const specs: BlockDecoration[] = []
    const excluded: SpanRange[] = []
    const atomic: SpanRange[] = []

    // ── 块级 ──
    for (const range of ranges) {
      const parsed = collectBlockDecorations({
        tree,
        text,
        from: range.from,
        to: range.to,
        selection,
        docPath
      })
      specs.push(...parsed.decorations)
      excluded.push(...parsed.excluded)
      atomic.push(...parsed.atomic)
    }

    // ── 行内 ──
    const spans: InlineSpan[] = []
    const seenSpans = new Set<string>()
    for (const range of ranges) {
      for (const span of collectInlineSpans({
        tree,
        text,
        from: range.from,
        to: range.to,
        excluded
      })) {
        const key = `${span.kind}:${span.from}:${span.to}`
        if (seenSpans.has(key)) continue
        seenSpans.add(key)
        spans.push(span)
      }
    }

    // ── 公式 ──
    const mathItems: MathItem[] = []
    const seenMath = new Set<string>()
    for (const range of ranges) {
      for (const item of collectMathItems({
        text,
        from: range.from,
        to: range.to,
        excluded
      })) {
        const key = `${item.from}:${item.to}`
        if (seenMath.has(key)) continue
        seenMath.add(key)
        mathItems.push(item)
      }
    }

    const mathRanges = mathItems.map((item) => ({ from: item.from, to: item.to }))
    const withinMath = (range: SpanRange): boolean => mathRanges.some((m) => intersects(range, m))

    const inline = buildDecorationSpecs(
      spans.filter((span) => !withinMath(span)),
      selection
    )
    for (const spec of inline.decorations) {
      if (!withinMath(spec)) {
        specs.push({ kind: spec.kind, from: spec.from, to: spec.to, className: spec.className })
      }
    }
    for (const range of inline.atomic) {
      if (!withinMath(range)) atomic.push(range)
    }

    for (const item of mathItems) {
      const source = { from: item.from, to: item.to }
      if (isRegionActive(source, selection)) continue

      const widget = {
        kind: 'math' as const,
        tex: item.tex,
        display: item.display,
        source
      }
      const multiline = item.display && text.slice(item.from, item.to).includes('\n')

      if (!multiline) {
        specs.push({ kind: 'replace', from: item.from, to: item.to, widget })
        atomic.push(source)
        continue
      }

      // ViewPlugin 不能提供跨行的块级 replace 装饰，否则布局会被彻底打乱。
      // 多行公式改为：首行整行替换成公式 widget，其余行逐行清空并折叠高度。
      const doc = view.state.doc
      const first = doc.lineAt(item.from)
      const last = doc.lineAt(item.to)
      specs.push(
        { kind: 'line', from: first.from, to: first.from, className: 'md-math-display-line' },
        { kind: 'replace', from: item.from, to: first.to, widget }
      )

      for (let n = first.number + 1; n <= last.number; n++) {
        const line = doc.line(n)
        const to = n === last.number ? Math.min(item.to, line.to) : line.to
        if (to > line.from) specs.push({ kind: 'replace', from: line.from, to })
        if (to >= line.to) {
          specs.push({ kind: 'line', from: line.from, to: line.from, className: 'md-hidden-line' })
        }
      }
      atomic.push(source)
    }

    // 同一位置可能同时有 line 与 widget 装饰，交给 Decoration.set 统一排序
    this.decorations = Decoration.set(specs.map(toDecoration), true)

    const atomicKeys = new Set<string>()
    const uniqueAtomic: SpanRange[] = []
    for (const range of atomic) {
      if (range.to <= range.from) continue
      const key = `${range.from}:${range.to}`
      if (atomicKeys.has(key)) continue
      atomicKeys.add(key)
      uniqueAtomic.push(range)
    }
    // atomicRanges 只接收 replace 区间，被隐藏的内容仍可正常进入与编辑
    this.atomic = Decoration.set(
      uniqueAtomic.map((range) => Decoration.replace({}).range(range.from, range.to)),
      true
    )
  }
}

export const livePreviewPlugin = ViewPlugin.define(
  (view) => new LivePreviewValue(view),
  { decorations: (value) => value.decorations }
)

export function livePreview(): Extension {
  return [
    livePreviewPlugin,
    EditorView.atomicRanges.of(
      (view) => view.plugin(livePreviewPlugin)?.atomic ?? Decoration.none
    )
  ]
}
