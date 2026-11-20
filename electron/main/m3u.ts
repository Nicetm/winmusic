import fs from 'node:fs/promises'
import path from 'node:path'

/** Datos minimos de una pista para escribir la lista. */
export interface M3uTrack {
  path: string
  name: string
  duration: number | null
  source: 'local' | 'youtube'
  videoId?: string
}

export type M3uEntry =
  | { kind: 'file'; path: string }
  | { kind: 'youtube'; videoId: string; title: string; duration: number | null }

const YT_ID = /(?:youtu\.be\/|[?&]v=)([A-Za-z0-9_-]{6,15})/

export async function exportM3u(filePath: string, tracks: M3uTrack[]): Promise<void> {
  const lines = ['#EXTM3U']
  for (const t of tracks) {
    const seconds = t.duration != null ? Math.round(t.duration) : -1
    lines.push(`#EXTINF:${seconds},${t.name}`)
    lines.push(
      t.source === 'youtube' && t.videoId
        ? `https://www.youtube.com/watch?v=${t.videoId}`
        : t.path,
    )
  }
  await fs.writeFile(filePath, lines.join('\r\n') + '\r\n', 'utf8')
}

/**
 * Lee una lista .m3u/.m3u8. Las rutas relativas se resuelven contra la
 * carpeta de la lista. Los enlaces de YouTube se conservan con su titulo
 * (#EXTINF). Otros enlaces web se ignoran: la app no los reproduce.
 */
export async function importM3u(filePath: string, isMediaFile: (p: string) => boolean): Promise<M3uEntry[]> {
  const raw = await fs.readFile(filePath, 'utf8')
  const baseDir = path.dirname(filePath)
  const entries: M3uEntry[] = []
  let pendingTitle: string | null = null
  let pendingDuration: number | null = null

  for (const rawLine of raw.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('#EXTINF:')) {
      const info = line.slice('#EXTINF:'.length)
      const comma = info.indexOf(',')
      const secs = Number(comma === -1 ? info : info.slice(0, comma))
      pendingDuration = Number.isFinite(secs) && secs > 0 ? secs : null
      pendingTitle = comma === -1 ? null : info.slice(comma + 1).trim() || null
      continue
    }
    if (line.startsWith('#')) continue

    if (/^https?:\/\//i.test(line)) {
      const id = YT_ID.exec(line)?.[1]
      if (id) {
        entries.push({ kind: 'youtube', videoId: id, title: pendingTitle ?? id, duration: pendingDuration })
      }
    } else {
      const full = path.isAbsolute(line) ? line : path.resolve(baseDir, line)
      try {
        const stat = await fs.stat(full)
        if (stat.isFile() && isMediaFile(full)) entries.push({ kind: 'file', path: full })
      } catch {
        // El archivo de la lista ya no existe en este equipo; se omite.
      }
    }
    pendingTitle = null
    pendingDuration = null
  }
  return entries
}
