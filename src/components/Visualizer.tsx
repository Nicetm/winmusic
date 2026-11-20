import { useEffect, useRef, useState } from 'react'
import { rainbowHue } from '../hooks/useRainbowAccent'
import { useT } from '../i18n'

interface Props {
  frequencies: Uint8Array<ArrayBuffer>
  playing: boolean
}

const MODES = ['bars', 'mirror', 'wave', 'dots'] as const
type Mode = (typeof MODES)[number]

function readVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return v || fallback
}

export function Visualizer({ frequencies, playing }: Props) {
  const { t } = useT()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem('wm-vis-mode')
    return (MODES as readonly string[]).includes(saved ?? '')
      ? (saved as Mode)
      : 'bars'
  })

  const cycleMode = () => {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length]
    setMode(next)
    localStorage.setItem('wm-vis-mode', next)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const w = rect.width
    const h = rect.height
    const stageBg = readVar('--stage-bg', '#0a0a0a')

    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = stageBg
    ctx.fillRect(0, 0, w, h)

    // Numero fijo de barras que llenan todo el ancho. Mapeo logaritmico desde
    // un bin inicial > 0, garantizando que cada barra cubra un rango de bins
    // distinto (asi las primeras no salen todas iguales).
    const BAR_COUNT = 56
    const total = frequencies.length || 1
    const minBin = 2
    const maxBin = Math.max(minBin + BAR_COUNT, Math.floor(total * 0.7))
    const logMin = Math.log(minBin)
    const logMax = Math.log(maxBin)
    const binAt = (t: number) => Math.exp(logMin + (logMax - logMin) * t)

    // Devuelve el valor [0..1] de la barra b promediando su segmento.
    const barValue = (b: number): number => {
      if (!playing) return 0
      let start = Math.floor(binAt(b / BAR_COUNT))
      let end = Math.floor(binAt((b + 1) / BAR_COUNT))
      if (end <= start) end = start + 1
      if (end > total) end = total
      let sum = 0
      for (let i = start; i < end; i++) sum += frequencies[i]
      const avg = sum / Math.max(1, end - start) / 255
      // Los graves traen mucha mas energia: se atenuan de forma progresiva
      // (55% en la primera barra, 100% hacia los agudos) para que no topen.
      const tilt = 0.55 + 0.45 * (b / (BAR_COUNT - 1))
      return Math.min(1, Math.pow(avg, 1.35) * 0.95 * tilt)
    }

    // Color arcoiris por posicion, sincronizado con el acento de la app.
    const hueShift = rainbowHue()
    const barColor = (b: number, alpha = 1) =>
      `hsla(${(hueShift + (b / BAR_COUNT) * 300) % 360}, 90%, 55%, ${alpha})`

    if (mode === 'bars') {
      const gap = 2
      const barWidth = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT
      for (let b = 0; b < BAR_COUNT; b++) {
        const barHeight = Math.max(2, barValue(b) * h)
        const x = b * (barWidth + gap)
        const y = h - barHeight
        const grad = ctx.createLinearGradient(0, y, 0, h)
        grad.addColorStop(0, barColor(b))
        grad.addColorStop(1, barColor(b, 0.25))
        ctx.fillStyle = grad
        ctx.fillRect(x, y, barWidth, barHeight)
        // Brillo en la punta de la barra.
        ctx.fillStyle = barColor(b)
        ctx.fillRect(x, y, barWidth, 2)
      }
    } else if (mode === 'mirror') {
      const gap = 2
      const barWidth = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT
      const mid = h / 2
      for (let b = 0; b < BAR_COUNT; b++) {
        const half = Math.max(1, (barValue(b) * h) / 2)
        const x = b * (barWidth + gap)
        ctx.fillStyle = barColor(b)
        ctx.fillRect(x, mid - half, barWidth, half)
        ctx.fillStyle = barColor(b, 0.4)
        ctx.fillRect(x, mid, barWidth, half)
      }
    } else if (mode === 'wave') {
      const grad = ctx.createLinearGradient(0, 0, w, 0)
      for (let s = 0; s <= 6; s++) grad.addColorStop(s / 6, barColor(s * (BAR_COUNT / 6)))
      ctx.beginPath()
      for (let b = 0; b < BAR_COUNT; b++) {
        const x = (b / (BAR_COUNT - 1)) * w
        const y = h - barValue(b) * h
        if (b === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = grad
      ctx.lineWidth = 2.5
      ctx.shadowColor = barColor(0)
      ctx.shadowBlur = 10
      ctx.stroke()
      ctx.shadowBlur = 0
    } else {
      // dots
      const step = w / BAR_COUNT
      for (let b = 0; b < BAR_COUNT; b++) {
        const x = b * step + step / 2
        const y = h - barValue(b) * h
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fillStyle = barColor(b)
        ctx.shadowColor = barColor(b)
        ctx.shadowBlur = 6
        ctx.fill()
        ctx.shadowBlur = 0
      }
    }
  }, [frequencies, playing, mode])

  return (
    <canvas
      ref={canvasRef}
      className="visualizer"
      onClick={cycleMode}
      title={t('stage.visualizerHint')}
    />
  )
}
