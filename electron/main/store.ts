import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PersistedState {
  windows: {
    main?: WindowBounds
    eq?: WindowBounds & { open: boolean }
    search?: WindowBounds & { open: boolean }
  }
  playlist: {
    tracks: unknown[]
    currentIndex: number
    shuffle: boolean
    repeat: string
    /** Listas guardadas con nombre; `tracks` es la copia de la activa. */
    lists: { id: string; name: string; tracks: unknown[] }[]
    activeId: string | null
  }
  audio: {
    volume: number
    muted: boolean
    eqGains: number[]
    eqPreset: string
  }
}

const EMPTY: PersistedState = {
  windows: {},
  playlist: {
    tracks: [],
    currentIndex: -1,
    shuffle: false,
    repeat: 'off',
    lists: [],
    activeId: null,
  },
  audio: { volume: 1, muted: false, eqGains: [], eqPreset: 'Plano' },
}

function storePath(): string {
  return path.join(app.getPath('userData'), 'winmusic-state.json')
}

/** Copia del estado tal como estaba al abrir la app (para poder recuperarlo). */
function backupPath(): string {
  return path.join(app.getPath('userData'), 'winmusic-state.backup.json')
}

export function loadState(): PersistedState {
  try {
    fs.copyFileSync(storePath(), backupPath())
  } catch {
    // Primera ejecucion: todavia no hay nada que respaldar.
  }
  try {
    const raw = fs.readFileSync(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      windows: parsed.windows ?? {},
      playlist: { ...EMPTY.playlist, ...parsed.playlist },
      audio: { ...EMPTY.audio, ...parsed.audio },
    }
  } catch {
    return structuredClone(EMPTY)
  }
}

let writeTimer: NodeJS.Timeout | null = null
let pending: PersistedState | null = null

/** Guarda el estado con un debounce para no escribir en cada evento. */
export function saveState(state: PersistedState): void {
  pending = state
  if (writeTimer) return
  writeTimer = setTimeout(() => {
    writeTimer = null
    if (!pending) return
    try {
      fs.writeFileSync(storePath(), JSON.stringify(pending, null, 2), 'utf8')
    } catch {
      // Si falla la escritura no interrumpimos la app.
    }
    pending = null
  }, 400)
}

/** Fuerza la escritura inmediata (al cerrar la app). */
export function flushState(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  if (!pending) return
  try {
    fs.writeFileSync(storePath(), JSON.stringify(pending, null, 2), 'utf8')
  } catch {
    // Ignorado
  }
  pending = null
}
