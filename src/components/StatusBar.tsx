import { useT } from '../i18n'
import { Icon } from './Icon'

interface Props {
  version: string
  fadeSeconds: number
  onCycleFade: () => void
  playbackRate: number
  onCycleSpeed: () => void
  /** Minutos que faltan para que se detenga la musica (null = apagado). */
  sleepMinutesLeft: number | null
  onCycleSleep: () => void
  /** Mensaje temporal (p.ej. resultado de importar/exportar). */
  notice: string | null
  onShowAbout: () => void
}

export function StatusBar({
  version,
  fadeSeconds,
  onCycleFade,
  playbackRate,
  onCycleSpeed,
  sleepMinutesLeft,
  onCycleSleep,
  notice,
  onShowAbout,
}: Props) {
  const { t } = useT()
  return (
    <div className="statusbar">
      <span className="statusbar__left">
        <button className="statusbar__btn statusbar__version" onClick={onShowAbout} title={t('status.about')}>
          v{version}
        </button>
        <button
          className="statusbar__btn statusbar__help"
          onClick={onShowAbout}
          aria-label={t('status.aboutHelp')}
          title={t('status.aboutHelp')}
        >
          <Icon name="help" size={13} />
        </button>
      </span>
      {notice ? (
        <span className="statusbar__notice">{notice}</span>
      ) : (
        <span className="statusbar__center">
          <button className="statusbar__btn" onClick={onCycleFade} title={t('status.fadeTitle')}>
            {t('status.fade', { value: fadeSeconds > 0 ? `${fadeSeconds} s` : t('status.fadeOff') })}
          </button>
          <button
            className={`statusbar__btn statusbar__icon-btn${playbackRate !== 1 ? ' is-active' : ''}`}
            onClick={onCycleSpeed}
            title={t('status.speedTitle')}
          >
            <Icon name="speed" size={13} />
            {t('status.speed', { value: playbackRate })}
          </button>
          <button
            className={`statusbar__btn statusbar__icon-btn${sleepMinutesLeft != null ? ' is-active' : ''}`}
            onClick={onCycleSleep}
            title={t('status.sleepTitle')}
            aria-label={t('status.sleepTitle')}
          >
            <Icon name="timer" size={13} />
            {sleepMinutesLeft != null && t('status.sleepLeft', { min: sleepMinutesLeft })}
          </button>
        </span>
      )}
      <button className="statusbar__btn statusbar__author" onClick={onShowAbout} title={t('status.about')}>
        by @softkey 2027
      </button>
    </div>
  )
}
