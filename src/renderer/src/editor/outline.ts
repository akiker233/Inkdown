export interface OutlineItem {
  level: number
  /** 去掉 Markdown 标记后的显示文本 */
  text: string
  /** 标题所在行的起始偏移，供编辑器跳转 */
  from: number
}

const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/
const SETEXT_RE = /^ {0,3}(=+|-+)[ \t]*$/
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/

function plainText(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/(\*\*|__|~~)/g, '')
    .trim()
}

/** 提取大纲标题；围栏代码里的 # 不算标题，Setext 标题按下一行下划线识别 */
export function parseOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = []
  const lines = content.split('\n')
  let offset = 0
  let fence: { char: string; length: number } | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const lineStart = offset
    offset += raw.length + 1

    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      if (!fence) {
        fence = { char: marker[0], length: marker.length }
      } else if (marker[0] === fence.char && marker.length >= fence.length) {
        fence = null
      }
      continue
    }
    if (fence) continue

    const atx = ATX_RE.exec(line)
    if (atx) {
      const text = plainText((atx[2] ?? '').replace(/[ \t]+#+[ \t]*$/, ''))
      items.push({ level: atx[1].length, text, from: lineStart })
      continue
    }

    const setext = SETEXT_RE.exec(line)
    if (setext && index > 0) {
      const previous = lines[index - 1].replace(/\r$/, '')
      if (
        previous.trim() &&
        !ATX_RE.test(previous) &&
        !FENCE_RE.test(previous) &&
        !/^ {0,3}([-*+>]|\d+[.)])\s/.test(previous)
      ) {
        items.push({
          level: setext[1][0] === '=' ? 1 : 2,
          text: plainText(previous),
          from: lineStart - lines[index - 1].length - 1
        })
      }
    }
  }

  return items
}
