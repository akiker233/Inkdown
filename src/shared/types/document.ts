export type Eol = 'lf' | 'crlf'

export type Enc = 'utf8' | 'utf8-bom' | 'utf16le'

export interface FileMeta {
  path: string
  name: string
  mtimeMs: number
  size: number
}

export interface FileReadResult {
  path: string
  content: string
  encoding: Enc
  eol: Eol
  mtimeMs: number
}

export interface FileWriteResult {
  mtimeMs: number
}

/** 关闭窗口时的未保存拦截结果 */
export type CloseConfirm = 'save' | 'discard' | 'cancel'
