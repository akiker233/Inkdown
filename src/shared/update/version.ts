/**
 * 轻量 SemVer 比较：只处理 x.y.z、预发布标签和构建元数据，
 * 避免为一个版本比较引入额外运行时依赖。
 */
export interface ParsedVersion {
  core: [number, number, number]
  prerelease: string[]
}

export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '')
}

export function parseVersion(version: string): ParsedVersion | null {
  const match = /^(\d+(?:\.\d+){0,2})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    normalizeVersion(version)
  )
  if (!match) return null

  const core = match[1].split('.').map(Number)
  while (core.length < 3) core.push(0)
  return {
    core: [core[0], core[1], core[2]],
    prerelease: match[2] ? match[2].split('.') : []
  }
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1

  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (a === undefined) return -1
    if (b === undefined) return 1

    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) {
      const diff = Number(a) - Number(b)
      if (diff !== 0) return Math.sign(diff)
    } else if (aNumeric) {
      return -1
    } else if (bNumeric) {
      return 1
    } else if (a !== b) {
      return a < b ? -1 : 1
    }
  }
  return 0
}

/** 返回 -1 / 0 / 1；任一版本无法解析时返回 null */
export function compareVersions(left: string, right: string): number | null {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return null

  for (let index = 0; index < 3; index += 1) {
    const diff = a.core[index] - b.core[index]
    if (diff !== 0) return Math.sign(diff)
  }
  return comparePrerelease(a.prerelease, b.prerelease)
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) === 1
}
