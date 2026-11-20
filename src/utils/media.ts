import type { Track } from '../types'
import { createId } from './id'

export async function buildTracks(paths: string[]): Promise<Track[]> {
  const tracks = await Promise.all(
    paths.map(async (p) => {
      const meta = await window.winmusic.parsePath(p)
      return {
        id: createId(),
        path: p,
        url: meta.url,
        name: meta.name,
        ext: meta.ext,
        kind: meta.kind,
        duration: null,
        source: 'local',
      } satisfies Track
    }),
  )
  return tracks
}
