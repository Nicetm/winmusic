import { Icon } from './Icon'

interface Props {
  volume: number
  muted: boolean
  onVolume: (v: number) => void
  onToggleMute: () => void
}

export function VolumeControl({ volume, muted, onVolume, onToggleMute }: Props) {
  const icon =
    muted || volume === 0 ? 'volumeMute' : volume < 0.5 ? 'volumeLow' : 'volumeHigh'
  return (
    <div className="volume">
      <button
        className="volume__btn"
        onClick={onToggleMute}
        aria-label="Silenciar"
        title="Silenciar"
      >
        <Icon name={icon} size={18} />
      </button>
      <input
        className="volume__range"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => onVolume(Number(e.target.value))}
        aria-label="Volumen"
      />
    </div>
  )
}
