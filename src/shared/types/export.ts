/** 导出格式标识，主进程与渲染进程共用 */
export type ExportFormat = 'html' | 'pdf' | 'png' | 'docx' | 'latex' | 'epub'

export interface ExportTocEntry {
  level: number
  text: string
  id: string
}

/** 渲染进程完成 Markdown 解析后交给主进程的内容包 */
export interface ExportPayload {
  format: ExportFormat
  path: string
  title: string
  docPath: string | null
  /** 完整自包含 HTML（图片仍是 inkdown-asset:// 或远程地址，由主进程内联） */
  html: string
  markdown: string
  /** 无 Pandoc 时的 LaTeX 降级正文（含完整导言区） */
  latex?: string
  dark: boolean
  toc: ExportTocEntry[]
  language: 'zh' | 'en'
}

export interface ExportResult {
  path: string
  usedPandoc: boolean
  /** 降级或部分内容无法完整转换时的提示 */
  warnings: string[]
}

export interface ExportCapabilities {
  pandoc: boolean
  pandocVersion: string | null
}
