import { useEffect, useMemo, useState } from 'react'
import { useT } from '../i18n'

export type LyricsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; synced: string | null; plain: string | null }

interface Props {
  state: LyricsState
  /** Devuelve la posicion exacta de la cancion en segundos. */
  getTime: () => number
  /** Identifica la cancion para recordar su ajuste de sincronizacion. */
  offsetKey: string
}

interface Line {
  time: number
  text: string
}

/** Convierte LRC ("[mm:ss.xx] texto") en lineas ordenadas por tiempo. */
function parseLrc(lrc: string): Line[] {
  const lines: Line[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    if (stamps.length === 0) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const m of stamps) lines.push({ time: Number(m[1]) * 60 + Number(m[2]), text })
  }
  return lines.sort((a, b) => a.time - b.time)
}

const VISIBLE_AROUND = 2
const OFFSET_STEP = 0.5

function storageKey(key: string): string {
  return `wm-lyrics-offset:${key}`
}

function readOffset(key: string): number {
  const v = Number(localStorage.getItem(storageKey(key)))
  return Number.isFinite(v) ? v : 0
}

export function LyricsView({ state, getTime, offsetKey }: Props) {
  const { t } = useT()
  const lines = useMemo(
    () => (state.status === 'ready' && state.synced ? parseLrc(state.synced) : []),
    [state],
  )

  // Ajuste manual por cancion: positivo = la letra aparece mas tarde.
  const [offset, setOffset] = useState(() => readOffset(offsetKey))
  useEffect(() => setOffset(readOffset(offsetKey)), [offsetKey])

  const changeOffset = (next: number) => {
    const rounded = Math.round(next * 10) / 10
    setOffset(rounded)
    if (rounded === 0) localStorage.removeItem(storageKey(offsetKey))
    else localStorage.setItem(storageKey(offsetKey), String(rounded))
  }

  // Linea activa calculada en cada cuadro (el evento timeupdate solo llega
  // unas 4 veces por segundo y la letra se adelantaba o atrasaba).
  const [active, setActive] = useState(-1)
  useEffect(() => {
    if (lines.length === 0) return
    let raf = 0
    const tick = () => {
      const t = getTime() - offset
      let idx = -1
      for (let i = 0; i < lines.length && lines[i].time <= t; i++) idx = i
      setActive(idx)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [lines, getTime, offset])

  if (state.status === 'loading') {
    return <div className="lyrics lyrics--msg">{t('lyr.loading')}</div>
  }
  if (state.status === 'error') {
    return <div className="lyrics lyrics--msg">{t('lyr.error')}</div>
  }
  if (lines.length === 0) {
    if (state.plain) return <div className="lyrics lyrics--plain">{state.plain}</div>
    return <div className="lyrics lyrics--msg">{t('lyr.none')}</div>
  }

  const from = Math.max(0, active - VISIBLE_AROUND)
  const shown = lines.slice(from, from + VISIBLE_AROUND * 2 + 1)
  const offsetLabel = `${offset > 0 ? '+' : ''}${offset.toFixed(1)} s`

  return (
    <div className="lyrics">
      {shown.map((line, i) => (
        <p
          key={`${line.time}-${from + i}`}
          className={`lyrics__line${from + i === active ? ' is-active' : ''}`}
        >
          {line.text || '♪'}
        </p>
      ))}
      <div className="lyrics__sync">
        <button
          className="lyrics__sync-btn"
          onClick={() => changeOffset(offset - OFFSET_STEP)}
          title={t('lyr.earlier')}
        >
          −0,5 s
        </button>
        <button
          className="lyrics__sync-value"
          onClick={() => changeOffset(0)}
          title={t('lyr.offset')}
        >
          {offsetLabel}
        </button>
        <button
          className="lyrics__sync-btn"
          onClick={() => changeOffset(offset + OFFSET_STEP)}
          title={t('lyr.later')}
        >
          +0,5 s
        </button>
      </div>
    </div>
  )
}
