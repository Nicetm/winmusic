import { useEffect } from 'react'
import { YoutubeSearch } from './components/YoutubeSearch'
import { Icon } from './components/Icon'
import { useRainbowAccent } from './hooks/useRainbowAccent'

/**
 * Ventana independiente del buscador de YouTube. Delega la reproduccion y el
 * agregado a la playlist en la ventana principal via IPC.
 */
export default function SearchWindow() {
  useRainbowAccent()
  useEffect(() => {
    const apply = () => {
      const theme = localStorage.getItem('wm-theme') || 'dark'
      document.documentElement.setAttribute('data-theme', theme)
    }
    apply()
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'wm-theme') apply()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <div className="searchwin">
      <div className="titlebar">
        <div className="titlebar__drag">
          <span className="titlebar__logo">YT</span>
          <span className="titlebar__track">Buscar en YouTube</span>
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
            className="titlebar__btn titlebar__btn--close"
            onClick={() => window.winmusic.close()}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>

      <YoutubeSearch onAdd={(r) => window.winmusic.searchAdd(r)} />
    </div>
  )
}
