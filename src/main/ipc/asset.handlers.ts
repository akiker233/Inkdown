import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { CH } from '@shared/ipc/channels'
import { mainT } from '../i18n'
import { getSettings } from '../services/settingsService'
import { handle } from './handle'

const IMAGE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.avif',
  '.ico'
])
const MAX_BYTES = 100 * 1024 * 1024
const INVALID_NAME = /[\\/:*?"<>|]/g

function safeBase(input: string): string {
  return input.replace(INVALID_NAME, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'image'
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

export function registerAssetHandlers(): void {
  handle(CH.assetImportImage, async (req) => {
    const { language } = await getSettings()
    if (!req.docPath) throw new Error(mainT(language, 'error.saveFirst'))

    let data: Buffer
    let ext: string
    let alt = req.alt?.trim() || 'image'

    if (req.sourcePath) {
      ext = extname(req.sourcePath).toLowerCase()
      if (!IMAGE_EXT.has(ext)) throw new Error(mainT(language, 'error.imageOnly'))
      const stat = await fs.stat(req.sourcePath)
      if (!stat.isFile()) throw new Error(mainT(language, 'error.notAFile'))
      data = await fs.readFile(req.sourcePath)
      alt = req.alt?.trim() || basename(req.sourcePath, ext)
    } else if (req.data && req.data.length > 0) {
      if (req.data.byteLength > MAX_BYTES) throw new Error(mainT(language, 'error.imageTooLarge'))
      ext = (req.ext ?? '.png').toLowerCase()
      if (!ext.startsWith('.')) ext = `.${ext}`
      if (!IMAGE_EXT.has(ext)) ext = '.png'
      data = Buffer.from(req.data)
    } else {
      throw new Error(mainT(language, 'error.noImageData'))
    }

    const assetsDir = join(dirname(req.docPath), 'assets')
    await fs.mkdir(assetsDir, { recursive: true })

    const base = safeBase(alt)
    let name = `${base}${ext}`
    let counter = 1
    while (await exists(join(assetsDir, name))) {
      name = `${base}-${counter}${ext}`
      counter += 1
    }

    const target = join(assetsDir, name)
    await fs.writeFile(target, data)

    const relative = `assets/${name}`
    const escapedAlt = alt.replace(/([\\\]])/g, '\\$1')
    return {
      path: target,
      relative,
      markdown: `![${escapedAlt}](${relative})`
    }
  })
}
