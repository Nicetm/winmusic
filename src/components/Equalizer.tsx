import { useState } from 'react'
import {
  EQ_BANDS,
  EQ_MAX_GAIN,
  EQ_MIN_GAIN,
  EQ_PRESETS,
  type EqGains,
} from '../audio/equalizer'
import { useT, type MessageKey } from '../i18n'
import { Icon } from './Icon'
import { PromptDialog } from './PromptDialog'

/** Nombre interno del ajuste manual (no es un preset guardado). */
export const CUSTOM_PRESET = 'Personalizado'

interface Props {
  gains: EqGains
  preset: string
  customPresets: Record<string, EqGains>
  onBandChange: (index: number, gainDb: number) => void
  onApplyPreset: (name: string, gains: EqGains) => void
  onSavePreset: (name: string) => void
  onDeletePreset: (name: string) => void
}

function formatFreq(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz)
}

export function Equalizer({
  gains,
  preset,
  customPresets,
  onBandChange,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
}: Props) {
  const { t } = useT()
  const [naming, setNaming] = useState(false)

  const builtInLabel = (name: string) => t(`eqPreset.${name}` as MessageKey)
  const isCustomSaved = preset in customPresets && !(preset in EQ_PRESETS)

  const applyPreset = (name: string) => {
    const values = customPresets[name] ?? EQ_PRESETS[name]
    if (values) onApplyPreset(name, values)
  }

  return (
    <div className="eq">
      <div className="eq__header">
        <span className="eq__title">{t('eq.title')}</span>
        <div className="eq__header-actions">
          <select
            className="eq__preset"
            value={preset}
            onChange={(e) => applyPreset(e.target.value)}
            aria-label={t('eq.preset')}
          >
            <optgroup label={t('eq.builtIn')}>
              {Object.keys(EQ_PRESETS).map((name) => (
                <option key={name} value={name}>
                  {builtInLabel(name)}
                </option>
              ))}
            </optgroup>
            {Object.keys(customPresets).length > 0 && (
              <optgroup label={t('eq.myPresets')}>
                {Object.keys(customPresets).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            )}
            {preset === CUSTOM_PRESET && <option value={CUSTOM_PRESET}>{t('eq.custom')}</option>}
          </select>
          <button
            className="eq__icon-btn"
            onClick={() => setNaming(true)}
            aria-label={t('eq.savePreset')}
            title={t('eq.savePreset')}
          >
            <Icon name="save" size={14} />
          </button>
          {isCustomSaved && (
            <button
              className="eq__icon-btn eq__icon-btn--danger"
              onClick={() => onDeletePreset(preset)}
              aria-label={t('eq.deletePreset')}
              title={t('eq.deletePreset')}
            >
              <Icon name="trash" size={14} />
            </button>
          )}
        </div>
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
              aria-label={t('eq.band', { freq: formatFreq(freq) })}
            />
            <span className="eq__freq">{formatFreq(freq)}</span>
          </div>
        ))}
      </div>

      {naming && (
        <PromptDialog
          title={t('eq.presetName')}
          initialValue={isCustomSaved ? preset : ''}
          confirmLabel={t('dlg.save')}
          onConfirm={(name) => {
            // No se puede pisar un preset incluido: se le agrega una marca.
            onSavePreset(name in EQ_PRESETS || name === CUSTOM_PRESET ? `${name} *` : name)
            setNaming(false)
          }}
          onCancel={() => setNaming(false)}
        />
      )}
    </div>
  )
}
