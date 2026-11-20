import {
  EQ_BANDS,
  EQ_MAX_GAIN,
  EQ_MIN_GAIN,
  EQ_PRESETS,
  type EqGains,
} from '../audio/equalizer'

interface Props {
  gains: EqGains
  preset: string
  onBandChange: (index: number, gainDb: number) => void
  onApplyPreset: (name: string, gains: EqGains) => void
}

function formatFreq(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz)
}

export function Equalizer({ gains, preset, onBandChange, onApplyPreset }: Props) {
  const applyPreset = (name: string) => {
    const values = EQ_PRESETS[name]
    if (values) onApplyPreset(name, values)
  }

  return (
    <div className="eq">
      <div className="eq__header">
        <span className="eq__title">Ecualizador</span>
        <select
          className="eq__preset"
          value={preset}
          onChange={(e) => applyPreset(e.target.value)}
          aria-label="Preset de ecualizador"
        >
          {Object.keys(EQ_PRESETS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {preset === 'Personalizado' && (
            <option value="Personalizado">Personalizado</option>
          )}
        </select>
      </div>

      <div className="eq__bands">
        {EQ_BANDS.map((freq, i) => (
          <div className="eq__band" key={freq}>
            <span className="eq__gain">{gains[i] > 0 ? `+${gains[i]}` : gains[i]}</span>
            <input
              className="eq__slider"
              type="range"
              min={EQ_MIN_GAIN}
              max={EQ_MAX_GAIN}
              step={1}
              value={gains[i] ?? 0}
              onChange={(e) => onBandChange(i, Number(e.target.value))}
              aria-label={`Banda ${formatFreq(freq)} Hz`}
            />
            <span className="eq__freq">{formatFreq(freq)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
