import { useCallback, useState } from 'react'
import type { RepeatMode, Track } from '../types'
import { buildTracks } from '../utils/media'

export interface PlaylistState {
  tracks: Track[]
  currentIndex: number
  shuffle: boolean
  repeat: RepeatMode
}

export interface PlaylistSnapshot {
  tracks: Track[]
  currentIndex: number
  shuffle: boolean
  repeat: RepeatMode
}

export type SortKey = 'name' | 'duration'

/**
 * Identidad de una pista para evitar duplicados. Un video de YouTube puede
 * estar dos veces: como audio y como video.
 */
export function trackKey(track: Track): string {
  if (track.source !== 'youtube') return `file:${track.path}`
  return track.kind === 'video' ? `ytv:${track.videoId}` : `yt:${track.videoId}`
}

export function usePlaylist() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<RepeatMode>('off')

  const hydrate = useCallback((snap: PlaylistSnapshot) => {
    setTracks(snap.tracks)
    setCurrentIndex(snap.currentIndex)
    setShuffle(snap.shuffle)
    setRepeat(snap.repeat)
  }, [])

  /** Agrega pistas al final, sin duplicar las que ya estan. */
  const appendTracks = useCallback((newTracks: Track[]) => {
    if (newTracks.length === 0) return
    setTracks((prev) => {
      const existing = new Set(prev.map(trackKey))
      const unique = newTracks.filter((t) => {
        const key = trackKey(t)
        if (existing.has(key)) return false
        existing.add(key)
        return true
      })
      return unique.length ? [...prev, ...unique] : prev
    })
    setCurrentIndex((idx) => (idx === -1 ? 0 : idx))
  }, [])

  const addPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      appendTracks(await buildTracks(paths))
    },
    [appendTracks],
  )

  /**
   * Agrega una pista y devuelve su indice. Si ya existe (misma ruta o mismo
   * video de YouTube), no la duplica y devuelve el indice de la existente.
   */
  const addTrack = useCallback((track: Track): number => {
    let targetIndex = -1
    setTracks((prev) => {
      const key = trackKey(track)
      const existingIndex = prev.findIndex((t) => trackKey(t) === key)
      if (existingIndex !== -1) {
        targetIndex = existingIndex
        return prev
      }
      targetIndex = prev.length
      return [...prev, track]
    })
    setCurrentIndex((idx) => (idx === -1 ? 0 : idx))
    return targetIndex
  }, [])

  /** Quita una o varias pistas (seleccion multiple). */
  const removeMany = useCallback((indices: number[]) => {
    const removed = new Set(indices)
    setTracks((prev) => prev.filter((_, i) => !removed.has(i)))
    setCurrentIndex((idx) => {
      if (idx < 0 || removed.has(idx)) return -1
      return idx - indices.filter((i) => i < idx).length
    })
  }, [])

  const clear = useCallback(() => {
    setTracks([])
    setCurrentIndex(-1)
  }, [])

  const move = useCallback((from: number, to: number) => {
    setTracks((prev) => {
      if (to < 0 || to >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
    setCurrentIndex((idx) => {
      if (idx === from) return to
      if (from < idx && to >= idx) return idx - 1
      if (from > idx && to <= idx) return idx + 1
      return idx
    })
  }, [])

  /**
   * Mueve un grupo de pistas (arrastrar) para que queden juntas, en su orden,
   * antes de la posicion `to` de la lista original (0..largo).
   */
  const moveMany = useCallback(
    (indices: number[], to: number) => {
      const moving = new Set(indices)
      const currentId = tracks[currentIndex]?.id
      const block = tracks.filter((_, i) => moving.has(i))
      const rest = tracks.filter((_, i) => !moving.has(i))
      const insertAt = to - indices.filter((i) => i < to).length
      const next = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]
      setTracks(next)
      if (currentId) setCurrentIndex(next.findIndex((t) => t.id === currentId))
    },
    [tracks, currentIndex],
  )

  /** Ordena la lista manteniendo seleccionada la misma pista. */
  const sortBy = useCallback(
    (key: SortKey) => {
      const currentId = tracks[currentIndex]?.id
      const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })
      const sorted = [...tracks].sort((a, b) =>
        key === 'name'
          ? collator.compare(a.name, b.name)
          : (a.duration ?? Number.MAX_VALUE) - (b.duration ?? Number.MAX_VALUE),
      )
      setTracks(sorted)
      if (currentId) setCurrentIndex(sorted.findIndex((t) => t.id === currentId))
    },
    [tracks, currentIndex],
  )

  const setDuration = useCallback((id: string, duration: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, duration } : t)),
    )
  }, [])

  const pickNextIndex = useCallback(
    (manual: boolean): number => {
      if (tracks.length === 0) return -1
      if (repeat === 'one' && !manual) return currentIndex
      if (shuffle) {
        if (tracks.length === 1) return currentIndex
        let n = currentIndex
        while (n === currentIndex) n = Math.floor(Math.random() * tracks.length)
        return n
      }
      const next = currentIndex + 1
      if (next >= tracks.length) return repeat === 'all' || manual ? 0 : -1
      return next
    },
    [tracks.length, repeat, shuffle, currentIndex],
  )

  const pickPrevIndex = useCallback((): number => {
    if (tracks.length === 0) return -1
    if (shuffle) {
      let n = currentIndex
      while (n === currentIndex && tracks.length > 1)
        n = Math.floor(Math.random() * tracks.length)
      return n
    }
    const prev = currentIndex - 1
    if (prev < 0) return repeat === 'all' ? tracks.length - 1 : 0
    return prev
  }, [tracks.length, shuffle, currentIndex, repeat])

  return {
    tracks,
    currentIndex,
    shuffle,
    repeat,
    setCurrentIndex,
    setShuffle,
    setRepeat,
    hydrate,
    addPaths,
    appendTracks,
    addTrack,
    removeMany,
    clear,
    move,
    moveMany,
    setDuration,
    sortBy,
    pickNextIndex,
    pickPrevIndex,
  }
}
