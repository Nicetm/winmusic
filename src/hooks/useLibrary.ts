import { useCallback, useMemo, useState } from 'react'
import type { Track } from '../types'
import { createId } from '../utils/id'
import { trackKey, type usePlaylist } from './usePlaylist'

export interface NamedList {
  id: string
  name: string
  tracks: Track[]
}

type Playlist = ReturnType<typeof usePlaylist>

/**
 * Varias listas con nombre. La lista activa vive en usePlaylist (es la que se
 * reproduce y edita); la biblioteca guarda el resto y, al cambiar, intercambia
 * su contenido con usePlaylist.
 */
export function useLibrary(playlist: Playlist) {
  const [lists, setLists] = useState<NamedList[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const { tracks, shuffle, repeat, hydrate } = playlist

  // Biblioteca con la lista activa al dia (sus pistas estan en usePlaylist).
  const syncedLists = useMemo(
    () => lists.map((l) => (l.id === activeId ? { ...l, tracks } : l)),
    [lists, activeId, tracks],
  )

  const load = useCallback(
    (target: NamedList) => {
      hydrate({ tracks: target.tracks, currentIndex: -1, shuffle, repeat })
      setActiveId(target.id)
    },
    [hydrate, shuffle, repeat],
  )

  /** Restaura la biblioteca guardada; crea "Principal" si no habia ninguna. */
  const hydrateLibrary = useCallback(
    (saved: NamedList[], savedActiveId: string | null, activeTracks: Track[]) => {
      const base = saved.length > 0 ? saved : [{ id: createId(), name: 'Principal', tracks: activeTracks }]
      const active = base.find((l) => l.id === savedActiveId) ?? base[0]
      setLists(base.map((l) => (l.id === active.id ? { ...l, tracks: activeTracks } : l)))
      setActiveId(active.id)
    },
    [],
  )

  const switchTo = useCallback(
    (id: string) => {
      if (id === activeId) return
      const target = syncedLists.find((l) => l.id === id)
      if (!target) return
      setLists(syncedLists)
      load(target)
    },
    [activeId, syncedLists, load],
  )

  const create = useCallback(
    (name: string, initialTracks: Track[] = []) => {
      const created: NamedList = { id: createId(), name, tracks: initialTracks }
      setLists([...syncedLists, created])
      load(created)
    },
    [syncedLists, load],
  )

  /**
   * Agrega pistas al final de otra lista (no la activa), sin duplicar.
   * Devuelve cuantas se agregaron.
   */
  const addToList = useCallback(
    (id: string, toAdd: Track[]): number => {
      const target = lists.find((l) => l.id === id)
      if (!target || id === activeId) return 0
      const existing = new Set(target.tracks.map(trackKey))
      const unique = toAdd.filter((t) => !existing.has(trackKey(t)))
      if (unique.length > 0) {
        setLists((prev) =>
          prev.map((l) => (l.id === id ? { ...l, tracks: [...l.tracks, ...unique] } : l)),
        )
      }
      return unique.length
    },
    [lists, activeId],
  )

  const rename = useCallback((id: string, name: string) => {
    setLists((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)))
  }, [])

  /** Elimina la lista activa y pasa a la primera restante (siempre queda una). */
  const removeActive = useCallback(() => {
    if (syncedLists.length <= 1) return
    const remaining = syncedLists.filter((l) => l.id !== activeId)
    setLists(remaining)
    load(remaining[0])
  }, [syncedLists, activeId, load])

  const activeName = syncedLists.find((l) => l.id === activeId)?.name ?? ''

  return {
    lists: syncedLists,
    activeId,
    activeName,
    hydrateLibrary,
    switchTo,
    create,
    addToList,
    rename,
    removeActive,
  }
}
