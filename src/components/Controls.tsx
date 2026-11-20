import type { RepeatMode } from '../types'
import { Icon } from './Icon'
import { useT } from '../i18n'

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
  const { t } = useT()
  const playLabel = playing ? t('ctl.pause') : t('ctl.play')
  return (
    <div className="controls">
      <button
        className={`controls__btn${shuffle ? ' is-active' : ''}`}
        onClick={onToggleShuffle}
        aria-label={t('ctl.shuffle')}
        title={t('ctl.shuffle')}
      >
        <Icon name="shuffle" />
      </button>
      <button
        className="controls__btn"
        onClick={onPrev}
        disabled={!canPlay}
        aria-label={t('ctl.prev')}
        title={t('ctl.prev')}
      >
        <Icon name="prev" />
      </button>
      <button
        className="controls__btn controls__btn--main"
        onClick={onToggle}
        disabled={!canPlay}
        aria-label={playLabel}
        title={playLabel}
      >
        <Icon name={playing ? 'pause' : 'play'} size={22} />
      </button>
      <button
        className="controls__btn"
        onClick={onStop}
        disabled={!canPlay}
        aria-label={t('ctl.stop')}
        title={t('ctl.stop')}
      >
        <Icon name="stop" />
      </button>
      <button
        className="controls__btn"
        onClick={onNext}
        disabled={!canPlay}
        aria-label={t('ctl.next')}
        title={t('ctl.next')}
      >
        <Icon name="next" />
      </button>
      <button
        className={`controls__btn${repeat !== 'off' ? ' is-active' : ''}`}
        onClick={onCycleRepeat}
        aria-label={t('ctl.repeat')}
        title={t(`ctl.repeat.${repeat}`)}
      >
        <Icon name={repeat === 'one' ? 'repeatOne' : 'repeat'} />
      </button>
    </div>
  )
}
