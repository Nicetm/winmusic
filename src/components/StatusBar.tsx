import { Icon } from './Icon'

interface Props {
  version: string
  fadeSeconds: number
  onCycleFade: () => void
  /** Mensaje temporal (p.ej. resultado de importar/exportar). */
  notice: string | null
  onShowAbout: () => void
}

export function StatusBar({ version, fadeSeconds, onCycleFade, notice, onShowAbout }: Props) {
  return (
    <div className="statusbar">
      <span className="statusbar__left">
        <button className="statusbar__btn statusbar__version" onClick={onShowAbout} title="Acerca de winMusic">
          v{version}
        </button>
        <button
          className="statusbar__btn statusbar__help"
          onClick={onShowAbout}
          aria-label="Acerca de y ayuda"
          title="Acerca de y ayuda"
        >
          <Icon name="help" size={13} />
        </button>
      </span>
      {notice ? (
        <span className="statusbar__notice">{notice}</span>
      ) : (
        <button
          className="statusbar__btn"
          onClick={onCycleFade}
          title="Fundido al terminar y empezar cada cancion"
        >
          Fundido: {fadeSeconds > 0 ? `${fadeSeconds} s` : 'no'}
        </button>
      )}
      <button className="statusbar__btn statusbar__author" onClick={onShowAbout} title="Acerca de winMusic">
        by @softkey 2027
      </button>
    </div>
  )
}
