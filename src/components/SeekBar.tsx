import { useState } from 'react'
import { formatTime } from '../utils/format'

interface Props {
  currentTime: number
  duration: number
  onSeek: (time: number) => void
}

/**
 * Mientras se arrastra solo se muestra la posicion; el salto se aplica al
 * soltar. En YouTube cada salto reinicia el stream, asi se hace uno solo.
 */
export function SeekBar({ currentTime, duration, onSeek }: Props) {
  const [dragValue, setDragValue] = useState<number | null>(null)
  const max = duration > 0 ? duration : 0
  const shown = dragValue ?? currentTime

  const commit = () => {
    if (dragValue === null) return
    onSeek(dragValue)
    setDragValue(null)
  }

  return (
    <div className="seekbar">
      <span className="seekbar__time">{formatTime(shown)}</span>
      <input
        className="seekbar__range"
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(shown, max)}
        disabled={max === 0}
        onChange={(e) => setDragValue(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label="Posicion de reproduccion"
      />
      <span className="seekbar__time">{formatTime(duration)}</span>
    </div>
  )
}
