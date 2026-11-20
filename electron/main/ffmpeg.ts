import { spawn } from 'node:child_process'
import { app } from 'electron'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'

/**
 * En produccion los binarios viven fuera del asar (unpacked). electron-builder
 * reescribe la ruta a app.asar.unpacked; aqui ajustamos por si el require
 * devuelve la ruta dentro del asar.
 */
function resolveBinary(rawPath: string): string {
  if (app.isPackaged) {
    return rawPath.replace('app.asar', 'app.asar.unpacked')
  }
  return rawPath
}

export const ffmpegPath = resolveBinary(ffmpegStatic as unknown as string)
export const ffprobePath = resolveBinary(ffprobeStatic.path)

// Formatos que Chromium reproduce de forma nativa sin transcodificar.
const NATIVE_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1', 'theora'])
const NATIVE_AUDIO_CODECS = new Set(['aac', 'opus', 'vorbis', 'mp3', 'flac'])
const NATIVE_CONTAINERS = new Set(['mov,mp4,m4a,3gp,3g2,mj2', 'matroska,webm', 'ogg', 'mp3', 'flac', 'wav'])

export interface ProbeResult {
  videoCodec: string | null
  audioCodec: string | null
  formatName: string
  nativePlayable: boolean
}

interface FfprobeStream {
  codec_type?: string
  codec_name?: string
  disposition?: { attached_pic?: number }
  tags?: Record<string, string>
}

interface FfprobeOutput {
  streams?: FfprobeStream[]
  format?: { format_name?: string; tags?: Record<string, string> }
}

/** La caratula de un MP3/M4A llega como "video" con disposition attached_pic. */
function isCoverStream(s: FfprobeStream): boolean {
  return s.codec_type === 'video' && s.disposition?.attached_pic === 1
}

function runProbe(filePath: string): Promise<FfprobeOutput> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath,
    ])
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => (out += d))
    proc.stderr.on('data', (d) => (err += d))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe salio con codigo ${code}: ${err}`))
        return
      }
      try {
        resolve(JSON.parse(out) as FfprobeOutput)
      } catch (e) {
        reject(e)
      }
    })
  })
}

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const data = await runProbe(filePath)
  const streams = data.streams ?? []
  const video = streams.find((s) => s.codec_type === 'video' && !isCoverStream(s))
  const audio = streams.find((s) => s.codec_type === 'audio')
  const videoCodec = video?.codec_name ?? null
  const audioCodec = audio?.codec_name ?? null
  const formatName = data.format?.format_name ?? ''

  const containerOk = formatName
    .split(',')
    .some((f) => NATIVE_CONTAINERS.has(formatName) || NATIVE_CONTAINERS.has(f))
  const videoOk = videoCodec === null || NATIVE_VIDEO_CODECS.has(videoCodec)
  const audioOk = audioCodec === null || NATIVE_AUDIO_CODECS.has(audioCodec)

  // Matroska/avi/etc con codecs nativos aun pueden fallar en Chromium (demux),
  // por eso solo consideramos nativo mp4/webm/ogg/audio puros.
  const safeContainer =
    formatName.includes('mp4') ||
    formatName.includes('webm') ||
    formatName.includes('ogg') ||
    formatName === 'mp3' ||
    formatName === 'flac' ||
    formatName === 'wav' ||
    containerOk

  return {
    videoCodec,
    audioCodec,
    formatName,
    nativePlayable: safeContainer && videoOk && audioOk,
  }
}

/**
 * Transcodifica (o remuxea) a MP4 fragmentado H.264/AAC por stdout, apto para
 * streaming progresivo en un elemento <video>. Si el codec de video ya es
 * nativo hace copy; si no, recodifica.
 */
export function transcodeToStream(filePath: string, probe: ProbeResult) {
  const videoArgs =
    probe.videoCodec && NATIVE_VIDEO_CODECS.has(probe.videoCodec)
      ? ['-c:v', 'copy']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']
  const audioArgs =
    probe.audioCodec && NATIVE_AUDIO_CODECS.has(probe.audioCodec)
      ? ['-c:a', 'copy']
      : ['-c:a', 'aac', '-b:a', '192k']

  const args = [
    '-i', filePath,
    ...videoArgs,
    ...audioArgs,
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1',
  ]

  const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  return proc
}

export interface MediaTags {
  title: string | null
  artist: string | null
  album: string | null
  hasCover: boolean
}

/** Las claves de las etiquetas varian en mayusculas segun el formato. */
function tagValue(tags: Record<string, string> | undefined, key: string): string | null {
  if (!tags) return null
  const found = Object.entries(tags).find(([k]) => k.toLowerCase() === key)
  const value = found?.[1]?.trim()
  return value ? value : null
}

/** Lee titulo, artista, album y si trae caratula incrustada. */
export async function readTags(filePath: string): Promise<MediaTags> {
  const data = await runProbe(filePath)
  const streams = data.streams ?? []
  // Algunos formatos (ogg/flac) guardan las etiquetas en el stream de audio.
  const audioTags = streams.find((s) => s.codec_type === 'audio')?.tags
  const pick = (key: string) => tagValue(data.format?.tags, key) ?? tagValue(audioTags, key)
  return {
    title: pick('title'),
    artist: pick('artist'),
    album: pick('album'),
    hasCover: streams.some(isCoverStream),
  }
}

/** Extrae la caratula incrustada como imagen (jpeg/png) o null si no hay. */
export function extractCover(filePath: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      ffmpegPath,
      ['-v', 'error', '-i', filePath, '-an', '-map', '0:v:0', '-c:v', 'copy', '-f', 'image2pipe', 'pipe:1'],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const chunks: Buffer[] = []
    proc.stdout.on('data', (d: Buffer) => chunks.push(d))
    proc.on('error', () => resolve(null))
    proc.on('close', (code) => {
      const buf = Buffer.concat(chunks)
      resolve(code === 0 && buf.length > 0 ? buf : null)
    })
  })
}

/**
 * Extrae solo el audio de una URL remota (p.ej. el stream de YouTube) y lo
 * entrega como MP3 por stdout. Descarta el video (-vn), lo que evita el
 * "Unsupported pixel format" cuando el stream trae video. Se usa MP3 porque
 * el MP4 fragmentado AAC daba PIPELINE_ERROR_DECODE en streaming progresivo;
 * el MP3 es decodificable por Chromium de forma fiable sin cabeceras moov.
 * `startSeconds` permite empezar desde un punto (seek): -ss antes de -i hace
 * un salto rapido en la entrada en vez de decodificar todo hasta ahi.
 */
export function extractAudioFromUrl(url: string, startSeconds = 0) {
  const seekArgs = startSeconds > 0 ? ['-ss', startSeconds.toFixed(2)] : []
  const args = [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    ...seekArgs,
    '-i', url,
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    '-f', 'mp3',
    'pipe:1',
  ]
  return spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
}
