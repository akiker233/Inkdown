/// <reference types="vite/client" />

import type { InkdownApi } from '@shared/ipc/api'

declare global {
  interface Window {
    api: InkdownApi
  }
}

export {}
