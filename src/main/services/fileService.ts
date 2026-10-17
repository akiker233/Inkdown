import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Enc, Eol, FileReadResult, FileWriteResult } from '@shared/types/document'

function detectEol(raw: string): Eol {
  const idx = raw.indexOf('\n')
  return idx > 0 && raw[idx - 1] === '\r' ? 'crlf' : 'lf'
}

function decode(buf: Buffer): { content: string; encoding: Enc } {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { content: buf.subarray(2).toString('utf16le'), encoding: 'utf16le' }
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { content: buf.subarray(3).toString('utf8'), encoding: 'utf8-bom' }
  }
  return { content: buf.toString('utf8'), encoding: 'utf8' }
}

function encode(content: string, encoding: Enc): Buffer {
  if (encoding === 'utf16le') {
    return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, 'utf16le')])
  }
  if (encoding === 'utf8-bom') {
    return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content, 'utf8')])
  }
  return Buffer.from(content, 'utf8')
}

/**
 * 读取时统一归一化为 LF 内存表示，换行风格单独记录，写回时还原。
 */
export async function readTextFile(path: string): Promise<FileReadResult> {
  const [buf, stat] = await Promise.all([fs.readFile(path), fs.stat(path)])
  const { content, encoding } = decode(buf)
  return {
    path,
    content: content.replace(/\r\n/g, '\n'),
    encoding,
    eol: detectEol(content),
    mtimeMs: stat.mtimeMs
  }
}

/** 原子写：先写同目录临时文件再 rename，避免写一半崩溃损坏原文件 */
async function atomicWrite(path: string, data: Buffer): Promise<void> {
  const tmp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`)
  await fs.writeFile(tmp, data)
  try {
    await fs.rename(tmp, path)
  } catch (error) {
    await fs.unlink(tmp).catch(() => undefined)
    throw error
  }
}

/**
 * 自己刚写过的文件。文件监听会把我们自己的保存也报成 change，
 * 这里留一个时间窗用来区分"外部修改"和"自己保存"。
 */
const selfWrites = new Map<string, number>()
const SELF_WRITE_WINDOW_MS = 2000

function pathKey(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

export function wasWrittenByUs(path: string): boolean {
  const at = selfWrites.get(pathKey(path))
  if (at === undefined) return false
  if (Date.now() - at > SELF_WRITE_WINDOW_MS) {
    selfWrites.delete(pathKey(path))
    return false
  }
  return true
}

export async function writeTextFile(
  path: string,
  content: string,
  eol: Eol = 'lf',
  encoding: Enc = 'utf8'
): Promise<FileWriteResult> {
  const withEol = eol === 'crlf' ? content.replace(/\r?\n/g, '\r\n') : content.replace(/\r\n/g, '\n')
  selfWrites.set(pathKey(path), Date.now())
  await atomicWrite(path, encode(withEol, encoding))
  const stat = await fs.stat(path)
  selfWrites.set(pathKey(path), Date.now())
  return { mtimeMs: stat.mtimeMs }
}
