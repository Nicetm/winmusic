import { execFile } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

/**
 * Binario incluido con la app: en desarrollo vive en ./bin, y empaquetado se
 * copia a process.resourcesPath/bin via extraResources.
 */
function bundledYtdlpPath(): string {
  const dev = path.join(app.getAppPath(), 'bin', 'yt-dlp.exe')
  if (fs.existsSync(dev)) return dev
  const devRoot = path.join(process.cwd(), 'bin', 'yt-dlp.exe')
  if (fs.existsSync(devRoot)) return devRoot
  const packed = path.join(process.resourcesPath || '', 'bin', 'yt-dlp.exe')
  if (fs.existsSync(packed)) return packed
  return 'yt-dlp'
}

/** Copia del usuario (userData), que es la que se puede actualizar. */
function userYtdlpPath(): string {
  return path.join(app.getPath('userData'), 'bin', 'yt-dlp.exe')
}

function ytdlpPath(): string {
  const user = userYtdlpPath()
  return fs.existsSync(user) ? user : bundledYtdlpPath()
}

/**
 * Prepara yt-dlp y lo actualiza en segundo plano. YouTube cambia a menudo y
 * una version vieja deja de funcionar; la carpeta de instalacion puede no ser
 * escribible, por eso se trabaja sobre una copia en userData.
 */
export function prepareYtdlp(): void {
  const user = userYtdlpPath()
  try {
    if (!fs.existsSync(user)) {
      const bundled = bundledYtdlpPath()
      if (!fs.existsSync(bundled)) return
      fs.mkdirSync(path.dirname(user), { recursive: true })
      fs.copyFileSync(bundled, user)
    }
  } catch (err) {
    console.error('[yt-dlp] no se pudo preparar la copia del usuario:', err)
    return
  }
  execFile(user, ['-U'], { timeout: 120000, windowsHide: true }, (err, stdout, stderr) => {
    if (err) {
      console.error('[yt-dlp] fallo la actualizacion:', (stderr || err.message).toString().trim())
      return
    }
    console.log('[yt-dlp]', stdout.toString().trim().split('\n').pop())
  })
}

export interface YtSearchResult {
  id: string
  title: string
  duration: number | null
  channel: string | null
}

interface YtFlatEntry {
  id?: string
  title?: string
  duration?: number | null
  channel?: string | null
  uploader?: string | null
}

export const SEARCH_PAGE_SIZE = 10

/**
 * Busca en YouTube y devuelve una pagina de resultados (solo metadatos).
 * ytsearch no admite desplazamiento: se piden los primeros page*N y
 * --playlist-items deja solo los de esa pagina.
 */
export function searchYoutube(query: string, page = 1): Promise<YtSearchResult[]> {
  return new Promise((resolve, reject) => {
    const bin = ytdlpPath()
    const p = Math.max(1, Math.floor(page))
    const end = p * SEARCH_PAGE_SIZE
    const start = end - SEARCH_PAGE_SIZE + 1
    const args = [
      `ytsearch${end}:${query}`,
      '--playlist-items',
      `${start}:${end}`,
      '--dump-json',
      '--flat-playlist',
      '--no-warnings',
    ]
    execFile(
      bin,
      args,
      { timeout: 30000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error((stderr || err.message || 'error').toString().split('\n')[0]))
          return
        }
        const results: YtSearchResult[] = []
        for (const line of stdout.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const entry = JSON.parse(trimmed) as YtFlatEntry
            if (!entry.id) continue
            results.push({
              id: entry.id,
              title: entry.title ?? entry.id,
              duration: entry.duration ?? null,
              channel: entry.channel ?? entry.uploader ?? null,
            })
          } catch {
            // Ignora lineas que no sean JSON valido
          }
        }
        resolve(results)
      },
    )
  })
}

const streamCache = new Map<string, { url: string; ts: number }>()
const STREAM_TTL = 90 * 60 * 1000 // las URLs de googlevideo caducan; 90 min de margen

/**
 * Resuelve la URL directa del stream de un video: solo audio o, con
 * `withVideo`, un formato con imagen y sonido. El player_client
 * android/web_embedded/tv evita el "Sign in to confirm you're not a bot".
 */
export function resolveStreamUrl(videoId: string, withVideo = false): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^[A-Za-z0-9_-]{6,15}$/.test(videoId)) {
      reject(new Error('id invalido'))
      return
    }
    const cacheKey = `${withVideo ? 'v' : 'a'}:${videoId}`
    const hit = streamCache.get(cacheKey)
    if (hit && Date.now() - hit.ts < STREAM_TTL) {
      resolve(hit.url)
      return
    }
    const bin = ytdlpPath()
    const args = [
      '-f', withVideo ? 'best[vcodec!=none][acodec!=none]/best' : 'bestaudio/best',
      '-g',
      '--no-warnings',
      '--no-playlist',
      '--extractor-args', 'youtube:player_client=android,web_embedded,tv',
      `https://www.youtube.com/watch?v=${videoId}`,
    ]
    execFile(bin, args, { timeout: 25000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error((stderr || err.message || 'error').toString().split('\n')[0]))
        return
      }
      const url = (stdout || '').trim().split('\n')[0]
      if (!url || !/^https?:\/\//.test(url)) {
        reject(new Error('sin url'))
        return
      }
      streamCache.set(cacheKey, { url, ts: Date.now() })
      resolve(url)
    })
  })
}
