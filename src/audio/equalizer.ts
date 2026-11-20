/** Frecuencias centrales de las 10 bandas (Hz), estilo ecualizador grafico. */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export const EQ_MIN_GAIN = -12
export const EQ_MAX_GAIN = 12

export type EqGains = number[]

/** Presets de ganancia por banda (dB), un valor por cada banda de EQ_BANDS. */
export const EQ_PRESETS: Record<string, EqGains> = {
  Plano: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Rock: [5, 4, 2, 0, -1, 0, 2, 4, 5, 5],
  Pop: [-1, 0, 2, 4, 4, 2, 0, -1, -1, -2],
  Jazz: [4, 3, 1, 2, -1, -1, 0, 1, 3, 4],
  Clásica: [5, 4, 3, 2, -1, -1, 0, 2, 3, 4],
  Dance: [6, 5, 2, 0, 0, -2, -3, -3, 0, 2],
  'Graves +': [8, 7, 5, 2, 0, 0, 0, 0, 0, 0],
  'Agudos +': [0, 0, 0, 0, 0, 2, 4, 6, 7, 8],
  Vocal: [-2, -3, -2, 1, 4, 5, 4, 2, 0, -1],
}

export const DEFAULT_PRESET = 'Plano'

export function flatGains(): EqGains {
  return EQ_BANDS.map(() => 0)
}
