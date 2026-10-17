import { describe, expect, it } from 'vitest'
import { compareVersions, isNewerVersion, parseVersion } from './version'

describe('parseVersion', () => {
  it('补齐缺失的版本段', () => {
    expect(parseVersion('1.2')).toEqual({ core: [1, 2, 0], prerelease: [] })
    expect(parseVersion('1')).toEqual({ core: [1, 0, 0], prerelease: [] })
  })

  it('接受 v 前缀、预发布与构建元数据', () => {
    expect(parseVersion('v1.2.3-beta.1+build.5')).toEqual({
      core: [1, 2, 3],
      prerelease: ['beta', '1']
    })
  })

  it('拒绝非法版本', () => {
    expect(parseVersion('latest')).toBeNull()
    expect(parseVersion('1.2.3.4')).toBeNull()
    expect(parseVersion('')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('比较主版本、次版本与补丁版本', () => {
    expect(compareVersions('0.1.1', '0.1.0')).toBe(1)
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1)
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1)
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('v0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
  })

  it('预发布版本低于正式版本', () => {
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1)
  })

  it('按 SemVer 规则比较预发布标识', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.1')).toBe(1)
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBe(-1)
  })

  it('忽略构建元数据', () => {
    expect(compareVersions('1.0.0+build.2', '1.0.0+build.1')).toBe(0)
  })

  it('无法解析时返回 null', () => {
    expect(compareVersions('latest', '1.0.0')).toBeNull()
  })
})

describe('isNewerVersion', () => {
  it('只在候选版本更高时返回 true', () => {
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true)
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false)
    expect(isNewerVersion('bad', '0.1.0')).toBe(false)
  })
})
