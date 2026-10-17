import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { shell } from 'electron'
import { CH } from '@shared/ipc/channels'
import { mainT } from '../i18n'
import type { AppLanguage } from '@shared/ipc/contract'
import { readTextFile, writeTextFile } from '../services/fileService'
import { getSettings } from '../services/settingsService'
import { handle } from './handle'

const INVALID_NAME = /[\\/:*?"<>|]/

function assertSafeName(name: string, language: AppLanguage): void {
  if (!name.trim()) throw new Error(mainT(language, 'error.nameEmpty'))
  if (name === '.' || name === '..') throw new Error(mainT(language, 'error.nameInvalid'))
  if (INVALID_NAME.test(name)) {
    throw new Error(mainT(language, 'error.nameForbiddenChars', { name }))
  }
}

export function registerFsHandlers(): void {
  handle(CH.fileRead, (req) => readTextFile(req.path))

  handle(CH.fileWrite, (req) =>
    writeTextFile(req.path, req.content, req.eol ?? 'lf', req.encoding ?? 'utf8')
  )

  handle(CH.fileCreate, async (req) => {
    const { language } = await getSettings()
    assertSafeName(req.name, language)
    const path = join(req.dir, req.name)
    if (req.kind === 'dir') {
      await fs.mkdir(path)
    } else {
      // 'wx' 保证同名文件已存在时直接失败，而不是静默覆盖
      const file = await fs.open(path, 'wx')
      await file.close()
    }
    return { path }
  })

  handle(CH.fileRename, async (req) => {
    const { language } = await getSettings()
    assertSafeName(basename(req.to), language)
    if (dirname(req.from) !== dirname(req.to)) {
      throw new Error(mainT(language, 'error.renameSameDir'))
    }
    await fs.rename(req.from, req.to)
    return { path: req.to }
  })

  handle(CH.fileDelete, async (req) => {
    // 走回收站而不是永久删除，给用户留后路
    await shell.trashItem(req.path)
  })

  handle(CH.fileReveal, (req) => {
    shell.showItemInFolder(req.path)
  })

  handle(CH.fileOpenExternal, async (req) => {
    // 只放行 http(s)，避免渲染进程诱导打开本地可执行文件
    const url = new URL(req.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      const { language } = await getSettings()
      throw new Error(mainT(language, 'error.externalHttpOnly', { url: req.url }))
    }
    await shell.openExternal(req.url)
  })
}
