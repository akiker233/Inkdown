import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const releaseDir = path.resolve(process.argv[2] ?? 'release')
const latestYml = path.join(releaseDir, 'latest.yml')

let yaml
try {
  yaml = await readFile(latestYml, 'utf8')
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('latest.yml not found, skipping hash refresh')
    process.exit(0)
  }
  throw error
}

const urlMatches = [...yaml.matchAll(/^\s*- url:\s*(.+)$/gm)]
if (urlMatches.length !== 1) {
  throw new Error(`expected exactly one file entry in latest.yml, found ${urlMatches.length}`)
}

const fileName = decodeURIComponent(urlMatches[0][1].trim())
const installerPath = path.join(releaseDir, fileName)
const data = await readFile(installerPath)
const sha512 = createHash('sha512').update(data).digest('base64')
const { size } = await stat(installerPath)

// Signing rewrites the installer, so the hash and size generated before signing are stale.
yaml = yaml.replace(/^(\s*sha512:\s*).*$/gm, `$1${sha512}`)
yaml = yaml.replace(/^(\s*size:\s*).*$/gm, `$1${size}`)

await writeFile(latestYml, yaml, 'utf8')
console.log(`Updated latest.yml for ${fileName} (${size} bytes)`)
