import { useEffect, useState } from 'react'
import type { SubtitleCue } from '../../electron/preload'

interface Props {
  cues: SubtitleCue[]
  /** Posicion real del video en segundos (incluye el desfase de los streams). */
  getTime: () => number
}

/** Subtitulos dibujados sobre el video (se ven tambien en pantalla completa). */
export function SubtitleOverlay({ cues, getTime }: Props) {
  const [text, setText] = useState('')

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const time = getTime()
      const cue = cues.find((c) => c.start <= time && time < c.end)
      setText(cue?.text ?? '')
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [cues, getTime])

  if (!text) return null
  return (
    <div className="subtitles">
      <span className="subtitles__text">{text}</span>
    </div>
  )
}
