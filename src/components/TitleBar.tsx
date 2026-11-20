import { Icon } from './Icon'

interface Props {
  title: string
}

export function TitleBar({ title }: Props) {
  return (
    <div className="titlebar">
      <div className="titlebar__drag">
        <span className="titlebar__logo">winMusic</span>
        <span className="titlebar__track" title={title}>
          {title}
        </span>
      </div>
      <div className="titlebar__controls">
        <button
          className="titlebar__btn"
          onClick={() => window.winmusic.minimize()}
          aria-label="Minimizar"
          title="Minimizar"
        >
          <Icon name="minimize" size={16} />
        </button>
        <button
          className="titlebar__btn"
          onClick={() => window.winmusic.toggleMaximize()}
          aria-label="Maximizar"
          title="Maximizar"
        >
          <Icon name="maximize" size={14} />
        </button>
        <button
          className="titlebar__btn titlebar__btn--close"
          onClick={() => window.winmusic.close()}
          aria-label="Cerrar"
          title="Cerrar"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  )
}
