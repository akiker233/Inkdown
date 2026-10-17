export type UpdateCheckStatus = 'up-to-date' | 'available' | 'error' | 'busy'

export type UpdateSource = 'github' | 'generic'

export interface UpdateCheckResult {
  status: UpdateCheckStatus
  source: UpdateSource
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  releaseName: string | null
  publishedAt: string | null
  /** 是否可以在应用内下载并安装（仅安装版 + 自定义 generic 更新源） */
  canAutoInstall: boolean
  error: string | null
}
