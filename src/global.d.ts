import type { WinMusicApi } from '../electron/preload'

declare global {
  interface Window {
    winmusic: WinMusicApi
  }
  const __APP_VERSION__: string
}

export {}
