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

/** Identidad de una pista para evitar duplicados. */
export function trackKey(track: Track): string {
  return track.source === 'youtube' ? `yt:${track.videoId}` : `file:${track.path}`
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

  const addPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    const newTracks = await buildTracks(paths)
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

  const removeAt = useCallback((index: number) => {
    setTracks((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next
    })
    setCurrentIndex((idx) => {
      if (index < idx) return idx - 1
      if (index === idx) return idx >= tracks.length - 1 ? tracks.length - 2 : idx
      return idx
    })
  }, [tracks.length])

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
    addTrack,
    removeAt,
    clear,
    move,
    setDuration,
    sortBy,
    pickNextIndex,
    pickPrevIndex,
  }
}
