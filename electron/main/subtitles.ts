import path from 'node:path'
import fs from 'node:fs/promises'

/** Linea de subtitulo: tiempos en segundos. */
export interface SubtitleCue {
  start: number
  end: number
  text: string
}

export const SUBTITLE_EXT = ['.srt', '.vtt']

/**
 * Los .srt suelen venir en UTF-8 o en Windows-1252 (latino). Se intenta
 * UTF-8 estricto y, si el archivo no es UTF-8 valido, se lee como 1252.
 */
function decode(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

/** "00:01:02,345" / "01:02.345" -> segundos. */
function parseTimestamp(raw: string): number {
  const parts = raw.trim().replace(',', '.').split(':').map(Number)
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

const TIMING = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/

/** Interpreta SRT y WebVTT (mismo esquema de bloques separados por linea en blanco). */
export function parseSubtitles(content: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  const blocks = content.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n')
    const timingIndex = lines.findIndex((l) => TIMING.test(l))
    if (timingIndex === -1) continue
    const match = TIMING.exec(lines[timingIndex])!
    const text = lines
      .slice(timingIndex + 1)
      .join('\n')
      // Etiquetas de formato (<i>, {\an8}...) no se muestran tal cual.
      .replace(/<[^>]+>|\{\\[^}]*\}/g, '')
      .trim()
    if (!text) continue
    cues.push({ start: parseTimestamp(match[1]), end: parseTimestamp(match[2]), text })
  }
  return cues.sort((a, b) => a.start - b.start)
}

export async function readSubtitles(filePath: string): Promise<SubtitleCue[]> {
  return parseSubtitles(decode(await fs.readFile(filePath)))
}

/** Busca un .srt/.vtt con el mismo nombre que el video, junto a el. */
export async function findSiblingSubtitles(videoPath: string): Promise<SubtitleCue[] | null> {
  const base = videoPath.slice(0, -path.extname(videoPath).length)
  for (const ext of SUBTITLE_EXT) {
    try {
      const cues = await readSubtitles(base + ext)
      if (cues.length > 0) return cues
    } catch {
      // No existe ese archivo: se prueba la siguiente extension.
    }
  }
  return null
}
