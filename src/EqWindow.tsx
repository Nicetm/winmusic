import { useEffect, useState } from 'react'
import { Equalizer } from './components/Equalizer'
import { Icon } from './components/Icon'
import { flatGains, type EqGains } from './audio/equalizer'
import { useRainbowAccent } from './hooks/useRainbowAccent'

/**
 * Ventana independiente del ecualizador. No posee el grafo de audio: emite las
 * ganancias por IPC a la ventana principal, que las aplica. Sincroniza su
 * estado inicial solicitandolo a la principal.
 */
export default function EqWindow() {
  useRainbowAccent()
  const [gains, setGains] = useState<EqGains>(() => flatGains())
  const [preset, setPreset] = useState('Plano')

  // Aplica el tema guardado y reacciona a cambios desde la ventana principal.
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

  useEffect(() => {
    const off = window.winmusic.onEqState((state) => {
      setGains(state.gains)
      setPreset(state.preset)
    })
    void window.winmusic.eqRequestState()
    return off
  }, [])

  const handleBand = (index: number, gainDb: number) => {
    setGains((prev) => {
      const next = [...prev]
      next[index] = gainDb
      return next
    })
    setPreset('Personalizado')
    window.winmusic.eqSetBand(index, gainDb)
  }

  const handlePreset = (name: string, values: EqGains) => {
    setGains([...values])
    setPreset(name)
    window.winmusic.eqSetPreset(name, values)
  }

  return (
    <div className="eqwin">
      <div className="titlebar">
        <div className="titlebar__drag">
          <span className="titlebar__logo">EQ</span>
          <span className="titlebar__track">Ecualizador</span>
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

      <Equalizer
        gains={gains}
        preset={preset}
        onBandChange={handleBand}
        onApplyPreset={handlePreset}
      />
    </div>
  )
}
