export type MediaKind = 'audio' | 'video'
export type TrackSource = 'local' | 'youtube'

export interface Track {
  id: string
  path: string
  url: string
  name: string
  ext: string
  kind: MediaKind
  duration: number | null
  source: TrackSource
  /** videoId de YouTube cuando source === 'youtube'. */
  videoId?: string
}

export type RepeatMode = 'off' | 'all' | 'one'
