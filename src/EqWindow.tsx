import { useEffect, useState } from 'react'
import { Equalizer, CUSTOM_PRESET } from './components/Equalizer'
import { TitleBar } from './components/TitleBar'
import { flatGains, type EqGains } from './audio/equalizer'
import { useRainbowAccent } from './hooks/useRainbowAccent'
import { useSharedTheme } from './hooks/useSharedTheme'
import { useT } from './i18n'

/**
 * Ventana independiente del ecualizador. No posee el grafo de audio: emite las
 * ganancias por IPC a la ventana principal, que las aplica. Sincroniza su
 * estado inicial solicitandolo a la principal.
 */
export default function EqWindow() {
  useRainbowAccent()
  useSharedTheme()
  const { t } = useT()
  const [gains, setGains] = useState<EqGains>(() => flatGains())
  const [preset, setPreset] = useState('Plano')
  const [customPresets, setCustomPresets] = useState<Record<string, EqGains>>({})

  useEffect(() => {
    const off = window.winmusic.onEqState((state) => {
      setGains(state.gains)
      setPreset(state.preset)
    })
    void window.winmusic.eqRequestState()
    void window.winmusic.eqGetCustomPresets().then(setCustomPresets)
    return off
  }, [])

  const handleBand = (index: number, gainDb: number) => {
    setGains((prev) => {
      const next = [...prev]
      next[index] = gainDb
      return next
    })
    setPreset(CUSTOM_PRESET)
    window.winmusic.eqSetBand(index, gainDb)
  }

  const handlePreset = (name: string, values: EqGains) => {
    setGains([...values])
    setPreset(name)
    window.winmusic.eqSetPreset(name, values)
  }

  const handleSavePreset = async (name: string) => {
    setCustomPresets(await window.winmusic.eqSaveCustomPreset(name, gains))
    handlePreset(name, gains)
  }

  const handleDeletePreset = async (name: string) => {
    setCustomPresets(await window.winmusic.eqDeleteCustomPreset(name))
    // Las ganancias quedan igual, pero ya no corresponden a un preset.
    setPreset(CUSTOM_PRESET)
    window.winmusic.eqSetPreset(CUSTOM_PRESET, gains)
  }

  return (
    <div className="eqwin">
      <TitleBar logo="EQ" title={t('win.eqTitle')} canMaximize={false} />
      <Equalizer
        gains={gains}
        preset={preset}
        customPresets={customPresets}
        onBandChange={handleBand}
        onApplyPreset={handlePreset}
        onSavePreset={(name) => void handleSavePreset(name)}
        onDeletePreset={(name) => void handleDeletePreset(name)}
      />
    </div>
  )
}
