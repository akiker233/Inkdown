import tokensCss from '../styles/tokens.css?raw'
import markdownCss from '../styles/markdown.css?raw'
import type { RenderMarkdownResult } from './markdown'

const EXPORT_CSS = `
html,
body {
  margin: 0;
  padding: 0;
  background: var(--bg-color);
}
body.inkdown-export {
  color: var(--text-color);
}
.export-body {
  box-sizing: border-box;
  max-width: var(--md-content-width);
  margin: 0 auto;
  padding: 48px 28px 64px;
}
.export-body img {
  max-width: 100%;
  height: auto;
}
.export-body a {
  color: var(--md-link-color);
}
.export-body .md-toc {
  margin: 0 0 1.4em;
  padding: 0.8em 1em;
  border: 1px solid var(--md-table-border);
  border-radius: 6px;
}
.export-body .md-toc ul {
  margin: 0.2em 0;
  padding-left: 1.4em;
}
.export-body .md-toc > ul {
  padding-left: 0;
  list-style: none;
}
.export-body .md-toc a {
  text-decoration: none;
}
.export-body .md-toc a:hover {
  text-decoration: underline;
}
.export-body .md-mermaid {
  margin: 1.2em 0;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
}
.export-body .md-mermaid svg {
  max-width: 100%;
  height: auto;
}
.export-body .md-mermaid-error {
  margin: 1em 0;
  padding: 0.75em 1em;
  border: 1px dashed #d9534f;
  border-radius: 6px;
  color: #d9534f;
  white-space: pre-wrap;
}
.export-body .md-math-block {
  margin: 0.8em 0;
  overflow-x: auto;
}
.export-body .md-math math {
  font-size: 1.02em;
}
.export-body math[display='block'] {
  margin: 0.4em 0;
}
.export-body .task-list-item {
  list-style: none;
}
.export-body .task-list-item-checkbox {
  margin: 0 0.4em 0 -1.2em;
  vertical-align: middle;
}
.export-body section.footnotes {
  margin-top: 2.4em;
  padding-top: 0.8em;
  border-top: 1px solid var(--md-hr-color);
  font-size: 0.9em;
}
.export-body section.footnotes hr {
  display: none;
}
.export-body .md-page-break {
  height: 0;
  break-after: page;
  page-break-after: always;
}
.export-body pre {
  white-space: pre-wrap;
  word-break: break-word;
}
.export-body pre code.hljs {
  background: none;
  padding: 0;
}
.export-body .hljs-comment,
.export-body .hljs-quote {
  color: var(--code-comment);
  font-style: italic;
}
.export-body .hljs-keyword,
.export-body .hljs-selector-tag,
.export-body .hljs-literal,
.export-body .hljs-doctag,
.export-body .hljs-meta-keyword {
  color: var(--code-keyword);
}
.export-body .hljs-string,
.export-body .hljs-regexp,
.export-body .hljs-attribute,
.export-body .hljs-meta .hljs-string {
  color: var(--code-string);
}
.export-body .hljs-number,
.export-body .hljs-symbol,
.export-body .hljs-bullet,
.export-body .hljs-link {
  color: var(--code-number);
}
.export-body .hljs-title,
.export-body .hljs-title.function_,
.export-body .hljs-section {
  color: var(--code-function);
}
.export-body .hljs-type,
.export-body .hljs-built_in,
.export-body .hljs-class .hljs-title,
.export-body .hljs-title.class_ {
  color: var(--code-type);
}
.export-body .hljs-operator,
.export-body .hljs-punctuation {
  color: var(--code-punct);
}
.export-body .hljs-variable,
.export-body .hljs-template-variable,
.export-body .hljs-params {
  color: var(--code-variable);
}
.export-body .hljs-property,
.export-body .hljs-attr {
  color: var(--code-property);
}
.export-body .hljs-tag {
  color: var(--code-tag);
}
.export-body .hljs-name,
.export-body .hljs-selector-id,
.export-body .hljs-selector-class {
  color: var(--code-attr);
}
.export-body .hljs-boolean {
  color: var(--code-bool);
}
.export-body .hljs-deletion {
  background: rgba(217, 83, 79, 0.16);
}
.export-body .hljs-addition {
  background: rgba(80, 161, 79, 0.16);
}

@media print {
  html,
  body {
    background: var(--bg-color);
  }
  .export-body {
    max-width: none;
    padding: 0;
  }
  .export-body h1,
  .export-body h2,
  .export-body h3,
  .export-body h4 {
    break-after: avoid;
    page-break-after: avoid;
  }
  .export-body pre,
  .export-body table,
  .export-body blockquote,
  .export-body figure,
  .export-body .md-math-block,
  .export-body .md-mermaid,
  .export-body img {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export interface BuildHtmlOptions {
  dark: boolean
  language: 'zh' | 'en'
}

/** 产出完整 HTML 文档；图片先保留 asset/http 地址，由主进程统一内联 */
export function buildExportHtml(
  rendered: RenderMarkdownResult,
  options: BuildHtmlOptions
): string {
  const lang = options.language === 'zh' ? 'zh-CN' : 'en'
  const author = rendered.author
    ? `<meta name="author" content="${escapeHtml(rendered.author)}">\n`
    : ''

  return `<!doctype html>
<html lang="${lang}" data-theme="${options.dark ? 'dark' : 'light'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Inkdown">
<title>${escapeHtml(rendered.title)}</title>
${author}<style>
${tokensCss}
${markdownCss}
${EXPORT_CSS}
</style>
</head>
<body class="inkdown-export">
<main class="markdown-body export-body">
${rendered.html}
</main>
</body>
</html>
`
}
