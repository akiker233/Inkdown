export interface TextStats {
  words: number
  chars: number
  charsNoSpaces: number
  cjk: number
  latin: number
  lines: number
  paragraphs: number
  readingMinutes: number
}

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g
const LATIN_RE = /[A-Za-z0-9][A-Za-z0-9'’_-]*/g

/** 中日韩字符按字计，拉丁文按词计 —— 与 Typora 的字数统计口径一致 */
export function analyzeText(text: string): TextStats {
  const cjk = text.match(CJK_RE)?.length ?? 0
  const latin = text.match(LATIN_RE)?.length ?? 0
  const words = cjk + latin
  const chars = [...text].length
  const charsNoSpaces = [...text.replace(/\s/g, '')].length

  return {
    words,
    chars,
    charsNoSpaces,
    cjk,
    latin,
    lines: text.length === 0 ? 1 : text.split('\n').length,
    paragraphs: text.split(/\n[ \t]*\n/).filter((block) => block.trim().length > 0).length,
    readingMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / 300))
  }
}
