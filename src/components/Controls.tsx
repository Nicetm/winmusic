import type { RepeatMode } from '../types'
import { Icon } from './Icon'

interface Props {
  playing: boolean
  shuffle: boolean
  repeat: RepeatMode
  canPlay: boolean
  onToggle: () => void
  onStop: () => void
  onPrev: () => void
  onNext: () => void
  onToggleShuffle: () => void
  onCycleRepeat: () => void
}

export function Controls({
  playing,
  shuffle,
  repeat,
  canPlay,
  onToggle,
  onStop,
  onPrev,
  onNext,
  onToggleShuffle,
  onCycleRepeat,
}: Props) {
  return (
    <div className="controls">
      <button
        className={`controls__btn${shuffle ? ' is-active' : ''}`}
        onClick={onToggleShuffle}
        aria-label="Aleatorio"
        title="Aleatorio"
      >
        <Icon name="shuffle" />
      </button>
      <button
        className="controls__btn"
        onClick={onPrev}
        disabled={!canPlay}
        aria-label="Anterior"
        title="Anterior"
      >
        <Icon name="prev" />
      </button>
      <button
        className="controls__btn controls__btn--main"
        onClick={onToggle}
        disabled={!canPlay}
        aria-label={playing ? 'Pausar' : 'Reproducir'}
        title={playing ? 'Pausar' : 'Reproducir'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={22} />
      </button>
      <button
        className="controls__btn"
        onClick={onStop}
        disabled={!canPlay}
        aria-label="Detener"
        title="Detener"
      >
        <Icon name="stop" />
      </button>
      <button
        className="controls__btn"
        onClick={onNext}
        disabled={!canPlay}
        aria-label="Siguiente"
        title="Siguiente"
      >
        <Icon name="next" />
      </button>
      <button
        className={`controls__btn${repeat !== 'off' ? ' is-active' : ''}`}
        onClick={onCycleRepeat}
        aria-label="Repetir"
        title={`Repetir: ${repeat}`}
      >
        <Icon name={repeat === 'one' ? 'repeatOne' : 'repeat'} />
      </button>
    </div>
  )
}
