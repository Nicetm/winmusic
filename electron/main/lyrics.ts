import { net, app } from 'electron'

export interface LyricsQuery {
  title: string
  artist: string | null
  duration: number | null
}

export interface LyricsResult {
  synced: string | null
  plain: string | null
}

interface LrclibEntry {
  trackName?: string
  artistName?: string
  duration?: number
  syncedLyrics?: string | null
  plainLyrics?: string | null
}

/**
 * Los titulos de YouTube traen ruido ("[OFFICIAL VIDEO]", "(Lyrics)", "HD"...)
 * que empeora la busqueda; se quita lo que va entre corchetes/parentesis y
 * las etiquetas habituales.
 */
function cleanTitle(title: string): string {
  return title
    .replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, ' ')
    .replace(/\b(official|oficial|video|videoclip|lyrics?|letra|audio|hd|4k|remastered)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tiempos (s) de las lineas con texto de una letra LRC, en orden. */
function lineTimes(lrc: string): number[] {
  const times: number[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const m = /^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/.exec(raw.trim())
    if (m && m[3].trim()) times.push(Number(m[1]) * 60 + Number(m[2]))
  }
  return times
}

const COMPARE_LINES = 20
const AGREE_SECONDS = 2.5

/**
 * Dos letras "coinciden" si todas sus primeras lineas caen a menos de
 * AGREE_SECONDS. Se usa el maximo y no el promedio: una letra mal marcada
 * suele tener bien casi todo y unas pocas lineas muy corridas.
 */
function agree(a: number[], b: number[]): boolean {
  const n = Math.min(a.length, b.length, COMPARE_LINES)
  if (n < 3) return false
  for (let i = 0; i < n; i++) if (Math.abs(a[i] - b[i]) > AGREE_SECONDS) return false
  return true
}

/**
 * Las letras de LRCLIB las suben usuarios y algunas tienen tiempos mal
 * marcados (aunque coincidan en duracion). Se elige la version con la que
 * coinciden mas letras; a igualdad, la de duracion mas parecida (las
 * entradas llegan ya ordenadas por eso).
 */
function pickByConsensus(entries: LrclibEntry[]): LrclibEntry | null {
  if (entries.length === 0) return null
  const times = entries.map((e) => lineTimes(e.syncedLyrics ?? ''))
  let best = 0
  let bestVotes = -1
  times.forEach((t, i) => {
    const votes = times.filter((other, j) => j !== i && agree(t, other)).length
    if (votes > bestVotes) {
      bestVotes = votes
      best = i
    }
  })
  return entries[best]
}

const cache = new Map<string, LyricsResult>()

/** Busca la letra en LRCLIB (gratuito, sin clave). Prefiere la sincronizada. */
export async function fetchLyrics(query: LyricsQuery): Promise<LyricsResult> {
  const q = [query.artist, cleanTitle(query.title)].filter(Boolean).join(' ').trim()
  if (!q) return { synced: null, plain: null }
  const cached = cache.get(q)
  if (cached) return cached

  const res = await net.fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': `winMusic/${app.getVersion()}` },
  })
  if (!res.ok) throw new Error(`LRCLIB respondio ${res.status}`)
  const entries = (await res.json()) as LrclibEntry[]

  const diff = (e: LrclibEntry) =>
    query.duration == null || e.duration == null ? 0 : Math.abs(e.duration - query.duration)
  const candidates = entries.filter((e) => diff(e) <= 8).sort((a, b) => diff(a) - diff(b))
  const synced = candidates.filter((e) => e.syncedLyrics)
  const best = pickByConsensus(synced) ?? candidates.find((e) => e.plainLyrics) ?? null

  const result: LyricsResult = {
    synced: best?.syncedLyrics ?? null,
    plain: best?.plainLyrics ?? null,
  }
  cache.set(q, result)
  return result
}
