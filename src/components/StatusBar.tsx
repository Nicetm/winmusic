interface Props {
  version: string
  fadeSeconds: number
  onCycleFade: () => void
  /** Mensaje temporal (p.ej. resultado de importar/exportar). */
  notice: string | null
}

export function StatusBar({ version, fadeSeconds, onCycleFade, notice }: Props) {
  return (
    <div className="statusbar">
      <span className="statusbar__version">v{version}</span>
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
      <span className="statusbar__author">by @softkey 2027</span>
    </div>
  )
}
