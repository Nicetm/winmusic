import { Icon } from './Icon'
import { useT } from '../i18n'

interface Props {
  title: string
  /** Texto del logo (winMusic en la principal, EQ / YT en las secundarias). */
  logo?: string
  /** Las secundarias no se maximizan. */
  canMaximize?: boolean
}

export function TitleBar({ title, logo = 'winMusic', canMaximize = true }: Props) {
  const { t } = useT()
  return (
    <div className="titlebar">
      <div className="titlebar__drag">
        <span className="titlebar__logo">{logo}</span>
        <span className="titlebar__track" title={title}>
          {title}
        </span>
      </div>
      <div className="titlebar__controls">
        <button
          className="titlebar__btn"
          onClick={() => window.winmusic.minimize()}
          aria-label={t('win.minimize')}
          title={t('win.minimize')}
        >
          <Icon name="minimize" size={16} />
        </button>
        {canMaximize && (
          <button
            className="titlebar__btn"
            onClick={() => window.winmusic.toggleMaximize()}
            aria-label={t('win.maximize')}
            title={t('win.maximize')}
          >
            <Icon name="maximize" size={14} />
          </button>
        )}
        <button
          className="titlebar__btn titlebar__btn--close"
          onClick={() => window.winmusic.close()}
          aria-label={t('win.close')}
          title={t('win.close')}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  )
}
