import { useCallback, useEffect, useRef, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Controls } from './components/Controls'
import { SeekBar } from './components/SeekBar'
import { VolumeControl } from './components/VolumeControl'
import { Visualizer } from './components/Visualizer'
import { Playlist } from './components/Playlist'
import { VideoControls } from './components/VideoControls'
import { StatusBar } from './components/StatusBar'
import { Icon } from './components/Icon'
import { createId } from './utils/id'
import { NowPlaying } from './components/NowPlaying'
import { LyricsView, type LyricsState } from './components/LyricsView'
import type { Track, RepeatMode } from './types'
import type { YtSearchResult, MediaTags, M3uEntry } from '../electron/preload'
import { usePlaylist, trackKey } from './hooks/usePlaylist'
import { useLibrary, type NamedList } from './hooks/useLibrary'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useDropFiles } from './hooks/useDropFiles'
import { useRainbowAccent } from './hooks/useRainbowAccent'
import { buildTracks } from './utils/media'

const FADE_STEPS = [0, 2, 4, 6]

export default function App() {
  const mediaRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  useRainbowAccent()
  const engine = useAudioEngine(mediaRef)
  const playlist = usePlaylist()
  const library = useLibrary(playlist)
  const [mini, setMini] = useState(false)
  const [showLyrics, setShowLyrics] = useState(false)
  const [lyrics, setLyrics] = useState<LyricsState>({ status: 'loading' })
  const [tags, setTags] = useState<MediaTags | null>(null)
  const [fadeSeconds, setFadeSeconds] = useState(() => {
    const saved = Number(localStorage.getItem('wm-fade'))
    return FADE_STEPS.includes(saved) ? saved : 0
  })
  const fadingOutRef = useRef(false)
  const { dragging } = useDropFiles((paths) => {
    void playlist.addPaths(paths)
  })
  const [eqOpen, setEqOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  // YouTube llega como stream sin rangos: al adelantar se reinicia desde un
  // segundo dado, y el tiempo del elemento cuenta desde ahi. Este desfase se
  // suma para mostrar la posicion real de la cancion.
  const [ytOffset, setYtOffset] = useState(0)
  const ytSeekRef = useRef<{ play: boolean; cleanup: () => void } | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('wm-theme') as 'dark' | 'light') || 'dark',
  )

  // Aplica el tema al documento y lo persiste.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('wm-theme', theme)
  }, [theme])
  // Peticion de reproduccion: token (para forzar reinicio aunque sea la misma
  // pista) + el indice exacto a reproducir (evita leer un estado desfasado).
  const [playRequest, setPlayRequest] = useState<{ token: number; index: number }>({
    token: 0,
    index: -1,
  })
  const hydratedRef = useRef(false)

  // Restaura playlist y audio guardados al iniciar.
  const { hydrate } = playlist
  const { hydrateLibrary } = library
  const { hydrateAudio } = engine
  useEffect(() => {
    let active = true
    window.winmusic.loadState().then((saved) => {
      if (!active) return
      const activeTracks = saved.playlist.tracks as Track[]
      hydrate({
        tracks: activeTracks,
        currentIndex: -1, // no autoreproducir al abrir
        shuffle: saved.playlist.shuffle,
        repeat: saved.playlist.repeat as RepeatMode,
      })
      hydrateLibrary(
        (saved.playlist.lists ?? []) as NamedList[],
        saved.playlist.activeId ?? null,
        activeTracks,
      )
      hydrateAudio({
        volume: saved.audio.volume,
        muted: saved.audio.muted,
        eqGains: saved.audio.eqGains,
        eqPreset: saved.audio.eqPreset,
      })
      hydratedRef.current = true
    })
    // Sincroniza el estado de los botones con las ventanas restauradas.
    window.winmusic.getWindowsOpenState().then((s) => {
      if (!active) return
      setEqOpen(s.eq)
      setSearchOpen(s.search)
    })
    return () => {
      active = false
    }
  }, [hydrate, hydrateLibrary, hydrateAudio])

  // Guarda la playlist y la biblioteca cuando cambian (tras la hidratacion).
  useEffect(() => {
    if (!hydratedRef.current) return
    window.winmusic.savePlaylist({
      tracks: playlist.tracks,
      currentIndex: playlist.currentIndex,
      shuffle: playlist.shuffle,
      repeat: playlist.repeat,
      lists: library.lists,
      activeId: library.activeId,
    })
  }, [
    playlist.tracks,
    playlist.currentIndex,
    playlist.shuffle,
    playlist.repeat,
    library.lists,
    library.activeId,
  ])

  // Guarda el estado de audio (volumen, mute, EQ) cuando cambia.
  useEffect(() => {
    if (!hydratedRef.current) return
    window.winmusic.saveAudio({
      volume: engine.volume,
      muted: engine.muted,
      eqGains: engine.eqGains,
      eqPreset: engine.eqPreset,
    })
  }, [engine.volume, engine.muted, engine.eqGains, engine.eqPreset])

  // Pista que esta sonando. Es independiente de la lista visible: al cambiar
  // de lista sigue sonando aunque no este en la nueva.
  const [playingTrack, setPlayingTrack] = useState<Track | null>(null)
  const current = playingTrack

  // Resalta en la lista visible la pista que suena (o nada si no esta ahi).
  const { tracks: visibleTracks, setCurrentIndex } = playlist
  useEffect(() => {
    if (!playingTrack) return
    const key = trackKey(playingTrack)
    setCurrentIndex(visibleTracks.findIndex((t) => trackKey(t) === key))
  }, [playingTrack, visibleTracks, library.activeId, setCurrentIndex])

  const isYoutube = current?.source === 'youtube' && !!current.videoId
  const position = engine.currentTime + (isYoutube ? ytOffset : 0)

  // Posicion que se esta escuchando: leida directo del elemento (mas precisa
  // que `position`, que llega con timeupdate cada ~250 ms) y descontando el
  // retardo de salida del audio. La usan las letras.
  const { getOutputLatency } = engine
  const getExactTime = useCallback(
    () =>
      (mediaRef.current?.currentTime ?? 0) + (isYoutube ? ytOffset : 0) - getOutputLatency(),
    [isYoutube, ytOffset, getOutputLatency],
  )

  // Salta a un segundo de la pista actual. Los archivos locales usan el seek
  // nativo; YouTube reinicia el stream desde ese punto (ffmpeg -ss).
  const seekTo = useCallback(
    (time: number) => {
      const media = mediaRef.current
      if (!media || !media.src || !current) return
      const target = Math.max(0, time)
      // Si estaba en pleno fundido de salida, el salto recupera el volumen.
      fadingOutRef.current = false
      engine.fadeTo(1, 0.15)
      if (current.source !== 'youtube' || !current.videoId) {
        engine.seek(target)
        return
      }
      // Si hay un salto pendiente, se respeta su intencion de reproducir.
      const shouldPlay = ytSeekRef.current ? ytSeekRef.current.play : !media.paused
      ytSeekRef.current?.cleanup()

      const onCanPlay = () => {
        ytSeekRef.current = null
        if (shouldPlay) engine.play()
        else setLoading(false)
      }
      const onError = () => {
        ytSeekRef.current = null
        setLoading(false)
      }
      media.addEventListener('canplay', onCanPlay, { once: true })
      media.addEventListener('error', onError, { once: true })
      ytSeekRef.current = {
        play: shouldPlay,
        cleanup: () => {
          media.removeEventListener('canplay', onCanPlay)
          media.removeEventListener('error', onError)
        },
      }

      setYtOffset(Math.floor(target))
      setLoading(true)
      media.src = `wmedia://youtube/${current.videoId}?t=${Math.floor(target)}`
      media.load()
    },
    [current, engine],
  )

  // Selecciona una pista y fuerza su reproduccion desde el inicio.
  const playIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= playlist.tracks.length) return
      playlist.setCurrentIndex(index)
      setPlayRequest((r) => ({ token: r.token + 1, index }))
    },
    [playlist],
  )

  const handleNext = useCallback(
    (manual: boolean) => {
      const next = playlist.pickNextIndex(manual)
      if (next === -1) {
        engine.pause()
        return
      }
      playlist.setCurrentIndex(next)
      setPlayRequest((r) => ({ token: r.token + 1, index: next }))
    },
    [playlist, engine],
  )

  // Boton play/pausa del transporte. Si no hay nada cargado, inicia la pista
  // actual (o la primera de la lista). Si ya hay media cargado, alterna.
  const handleToggle = useCallback(() => {
    const media = mediaRef.current
    const hasLoaded = media && media.src && media.src !== window.location.href
    if (hasLoaded) {
      engine.toggle()
      return
    }
    const index = playlist.currentIndex >= 0 ? playlist.currentIndex : 0
    if (index < playlist.tracks.length) playIndex(index)
  }, [engine, playlist.currentIndex, playlist.tracks.length, playIndex])

  const handlePrev = useCallback(() => {
    if (position > 3) {
      seekTo(0)
      return
    }
    const prev = playlist.pickPrevIndex()
    if (prev === -1) return
    playlist.setCurrentIndex(prev)
    setPlayRequest((r) => ({ token: r.token + 1, index: prev }))
  }, [playlist, position, seekTo])

  const handleStop = useCallback(() => {
    engine.pause()
    seekTo(0)
  }, [engine, seekTo])

  /** Detiene y vacia el elemento media (al quedar sin pista actual). */
  const clearMedia = useCallback(() => {
    const media = mediaRef.current
    if (!media) return
    ytSeekRef.current?.cleanup()
    ytSeekRef.current = null
    setYtOffset(0)
    setPlayingTrack(null)
    media.pause()
    media.removeAttribute('src')
    media.load()
  }, [])

  // Quita una pista; si era la que sonaba, detiene y limpia el reproductor.
  const handleRemove = useCallback(
    (index: number) => {
      const wasCurrent = index === playlist.currentIndex
      playlist.removeAt(index)
      if (wasCurrent) clearMedia()
    },
    [playlist, clearMedia],
  )

  // Vaciar la lista solo detiene la musica si la que suena es de esta lista.
  const handleClear = useCallback(() => {
    const playingHere = playlist.currentIndex >= 0
    playlist.clear()
    if (playingHere) clearMedia()
  }, [playlist, clearMedia])

  // Carga y reproduce la pista solicitada. Toma la pista por indice desde un
  // ref a la lista para no depender de `current` (que va un render atrasado y
  // hacia que el primer doble clic no reprodujera).
  const enginePlay = engine.play
  const engineFadeTo = engine.fadeTo
  // Ref para que cambiar el fundido no re-ejecute la carga de la pista.
  const fadeSecondsRef = useRef(fadeSeconds)
  useEffect(() => {
    fadeSecondsRef.current = fadeSeconds
    localStorage.setItem('wm-fade', String(fadeSeconds))
  }, [fadeSeconds])
  const tracksRef = useRef(playlist.tracks)
  useEffect(() => {
    tracksRef.current = playlist.tracks
  }, [playlist.tracks])

  useEffect(() => {
    if (playRequest.token === 0) return // no autoreproducir al iniciar
    const media = mediaRef.current
    const track = tracksRef.current[playRequest.index]
    if (!media || !track) return
    setPlayingTrack(track)

    // Una pista nueva empieza desde 0 y anula cualquier salto pendiente.
    ytSeekRef.current?.cleanup()
    ytSeekRef.current = null
    setYtOffset(0)

    const url =
      track.source === 'youtube' && track.videoId
        ? `wmedia://youtube/${track.videoId}`
        : track.url

    setLoading(true)
    fadingOutRef.current = false
    const onCanPlay = () => {
      enginePlay()
      // Fundido de entrada (o volumen completo si esta desactivado).
      const fade = fadeSecondsRef.current
      if (fade > 0) engineFadeTo(1, fade, 0)
      else engineFadeTo(1, 0.01, 1)
    }
    const onPlaying = () => setLoading(false)
    const onError = () => setLoading(false)
    media.addEventListener('canplay', onCanPlay, { once: true })
    media.addEventListener('playing', onPlaying)
    media.addEventListener('error', onError)
    media.src = url
    media.load()

    return () => {
      media.removeEventListener('canplay', onCanPlay)
      media.removeEventListener('playing', onPlaying)
      media.removeEventListener('error', onError)
    }
  }, [playRequest, enginePlay, engineFadeTo])

  // Guarda la duracion cuando el metadata esta disponible.
  useEffect(() => {
    const media = mediaRef.current
    // En YouTube la duracion viene de la busqueda; la del stream (que puede
    // empezar a mitad de cancion al adelantar) no es la real.
    if (!media || !current || current.source === 'youtube') return
    const onMeta = () => {
      if (Number.isFinite(media.duration)) {
        playlist.setDuration(current.id, media.duration)
      }
    }
    media.addEventListener('loadedmetadata', onMeta)
    return () => media.removeEventListener('loadedmetadata', onMeta)
  }, [current, playlist])

  // Avanza al terminar la pista.
  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    const onEnded = () => handleNext(false)
    media.addEventListener('ended', onEnded)
    return () => media.removeEventListener('ended', onEnded)
  }, [handleNext])

  // Puente IPC con la ventana del ecualizador.
  const { setAllGains, setBandGain, setEqPreset, eqGains, eqPreset } = engine
  // Mantiene una referencia viva al estado del EQ para responder requestState.
  const eqStateRef = useRef({ gains: eqGains, preset: eqPreset })
  useEffect(() => {
    eqStateRef.current = { gains: eqGains, preset: eqPreset }
  }, [eqGains, eqPreset])

  useEffect(() => {
    const offGains = window.winmusic.onEqApplyGains((preset, g) => {
      setAllGains(g)
      setEqPreset(preset)
      setEqOpen(true)
    })
    const offBand = window.winmusic.onEqApplyBand((i, g) => {
      setBandGain(i, g)
      setEqOpen(true)
    })
    const offRequest = window.winmusic.onEqRequestState(() => {
      window.winmusic.eqPublishState(eqStateRef.current)
      setEqOpen(true)
    })
    const offClosed = window.winmusic.onEqWindowClosed(() => setEqOpen(false))
    return () => {
      offGains()
      offBand()
      offRequest()
      offClosed()
    }
  }, [setAllGains, setBandGain, setEqPreset])

  const addFiles = useCallback(async () => {
    const paths = await window.winmusic.openFiles()
    await playlist.addPaths(paths)
  }, [playlist])

  const addFolder = useCallback(async () => {
    const paths = await window.winmusic.openFolder()
    await playlist.addPaths(paths)
  }, [playlist])

  const cycleRepeat = useCallback(() => {
    playlist.setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
  }, [playlist])

  const ytResultToTrack = useCallback((r: YtSearchResult): Track => {
    return {
      id: createId(),
      path: `youtube:${r.id}`,
      url: '',
      name: r.title,
      ext: '',
      kind: 'audio',
      duration: r.duration,
      source: 'youtube',
      videoId: r.id,
    }
  }, [])

  const addYoutube = useCallback(
    (r: YtSearchResult) => {
      playlist.addTrack(ytResultToTrack(r))
    },
    [playlist, ytResultToTrack],
  )

  const playYoutube = useCallback(
    (r: YtSearchResult) => {
      const index = playlist.addTrack(ytResultToTrack(r))
      if (index >= 0) playIndex(index)
    },
    [playlist, ytResultToTrack, playIndex],
  )

  // Puente IPC con la ventana del buscador de YouTube.
  useEffect(() => {
    const offPlay = window.winmusic.onSearchPlayResult((r) => {
      playYoutube(r)
      setSearchOpen(true)
    })
    const offAdd = window.winmusic.onSearchAddResult((r) => {
      addYoutube(r)
      setSearchOpen(true)
    })
    const offClosed = window.winmusic.onSearchWindowClosed(() => setSearchOpen(false))
    const offState = window.winmusic.onWindowsOpenState((s) => {
      setSearchOpen(s.search)
      setEqOpen(s.eq)
    })
    return () => {
      offPlay()
      offAdd()
      offClosed()
      offState()
    }
  }, [playYoutube, addYoutube])

  const isVideo = current?.kind === 'video'

  // En YouTube la duracion real es la del resultado de busqueda (el stream MP3
  // no la reporta, o reporta solo lo que queda tras adelantar). En archivos
  // locales manda la del elemento.
  const effectiveDuration =
    isYoutube && current?.duration
      ? current.duration
      : engine.duration > 0 && Number.isFinite(engine.duration)
        ? engine.duration
        : (current?.duration ?? 0)

  // Fundido de salida: al entrar en los ultimos segundos, baja el volumen
  // hasta 0 justo al terminar (la siguiente pista entra con fundido).
  const enginePlaying = engine.playing
  useEffect(() => {
    if (fadeSeconds <= 0 || !enginePlaying || effectiveDuration <= 0) return
    const remaining = effectiveDuration - position
    if (remaining > 0 && remaining <= fadeSeconds && !fadingOutRef.current) {
      fadingOutRef.current = true
      engineFadeTo(0, remaining)
    }
  }, [position, effectiveDuration, fadeSeconds, enginePlaying, engineFadeTo])

  const cycleFade = useCallback(() => {
    setFadeSeconds((s) => FADE_STEPS[(FADE_STEPS.indexOf(s) + 1) % FADE_STEPS.length])
  }, [])

  // Mensaje breve en la barra de estado (resultado de importar/exportar).
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => window.winmusic.onNotice(setNotice), [])
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(id)
  }, [notice])

  // Etiquetas (titulo, artista, caratula) de los archivos de audio locales.
  const currentId = current?.id
  const currentPath = current?.path
  const currentIsLocalAudio = current?.source === 'local' && current.kind === 'audio'
  useEffect(() => {
    setTags(null)
    if (!currentPath || !currentIsLocalAudio) return
    let active = true
    window.winmusic
      .getTags(currentPath)
      .then((t) => active && setTags(t))
      .catch((err) => console.warn('[winmusic] no se pudieron leer las etiquetas:', err))
    return () => {
      active = false
    }
  }, [currentId, currentPath, currentIsLocalAudio])

  const displayTitle = tags?.title ?? current?.name ?? ''
  const displayArtist = tags?.artist ?? null
  const coverUrl = !current
    ? null
    : isYoutube
      ? `https://i.ytimg.com/vi/${current.videoId}/mqdefault.jpg`
      : tags?.hasCover
        ? current.url.replace('wmedia://local/', 'wmedia://cover/')
        : null

  // Letra de la cancion actual (solo se busca con el panel de letras abierto).
  const durationRef = useRef(effectiveDuration)
  durationRef.current = effectiveDuration
  useEffect(() => {
    if (!showLyrics || !currentId || !displayTitle) return
    let active = true
    setLyrics({ status: 'loading' })
    window.winmusic
      .getLyrics({
        title: displayTitle,
        artist: displayArtist,
        duration: durationRef.current > 0 ? durationRef.current : null,
      })
      .then((r) => active && setLyrics({ status: 'ready', synced: r.synced, plain: r.plain }))
      .catch((err) => {
        console.warn('[winmusic] no se pudo buscar la letra:', err)
        if (active) setLyrics({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [showLyrics, currentId, displayTitle, displayArtist])

  // --- Listas con nombre. La musica sigue sonando al cambiar de lista. ---
  const handleSwitchList = useCallback((id: string) => library.switchTo(id), [library])

  const handleNewList = useCallback((name: string) => library.create(name), [library])

  const handleRenameList = useCallback(
    (name: string) => {
      if (library.activeId) library.rename(library.activeId, name)
    },
    [library],
  )

  const handleDeleteList = useCallback(() => library.removeActive(), [library])

  const handleExportList = useCallback(async () => {
    try {
      const saved = await window.winmusic.exportPlaylist(
        library.activeName,
        playlist.tracks.map((t) => ({
          path: t.path,
          name: t.name,
          duration: t.duration,
          source: t.source,
          videoId: t.videoId,
        })),
      )
      if (saved) setNotice('Lista exportada')
    } catch (err) {
      console.error('[winmusic] error al exportar la lista:', err)
      setNotice('No se pudo exportar la lista')
    }
  }, [library.activeName, playlist.tracks])

  // Importa un .m3u como lista nueva, conservando el orden del archivo.
  const handleImportList = useCallback(async () => {
    try {
      const result = await window.winmusic.importPlaylist()
      if (!result) return
      const filePaths = result.entries
        .filter((e): e is Extract<M3uEntry, { kind: 'file' }> => e.kind === 'file')
        .map((e) => e.path)
      const fileTracks = new Map((await buildTracks(filePaths)).map((t) => [t.path, t]))
      const seen = new Set<string>()
      const tracks: Track[] = []
      for (const e of result.entries) {
        const key = e.kind === 'file' ? `file:${e.path}` : `yt:${e.videoId}`
        if (seen.has(key)) continue
        seen.add(key)
        const track =
          e.kind === 'file'
            ? fileTracks.get(e.path)
            : ytResultToTrack({ id: e.videoId, title: e.title, duration: e.duration, channel: null })
        if (track) tracks.push(track)
      }
      library.create(result.name, tracks)
      setNotice(`Lista importada: ${tracks.length} pistas`)
    } catch (err) {
      console.error('[winmusic] error al importar la lista:', err)
      setNotice('No se pudo importar la lista')
    }
  }, [library, ytResultToTrack])

  // Respaldo completo (todas las listas, ecualizador y volumen) en un archivo.
  const handleExportBackup = useCallback(async () => {
    try {
      if (await window.winmusic.exportBackup()) setNotice('Respaldo exportado')
    } catch (err) {
      console.error('[winmusic] error al exportar el respaldo:', err)
      setNotice('No se pudo exportar el respaldo')
    }
  }, [])

  // Si se importa, el main recarga la ventana con los datos nuevos.
  const handleImportBackup = useCallback(async () => {
    try {
      const result = await window.winmusic.importBackup()
      if (result === 'invalid') setNotice('El archivo no es un respaldo de winMusic')
    } catch (err) {
      console.error('[winmusic] error al importar el respaldo:', err)
      setNotice('No se pudo importar el respaldo')
    }
  }, [])

  // Copiar / mover una cancion de la lista activa a otra lista.
  const listName = useCallback(
    (id: string) => library.lists.find((l) => l.id === id)?.name ?? '',
    [library.lists],
  )

  const handleCopyToList = useCallback(
    (index: number, listId: string) => {
      const track = playlist.tracks[index]
      if (!track) return
      const added = library.addToList(listId, [track])
      setNotice(added ? `Copiada a «${listName(listId)}»` : `Ya estaba en «${listName(listId)}»`)
    },
    [playlist.tracks, library, listName],
  )

  const handleMoveToList = useCallback(
    (index: number, listId: string) => {
      const track = playlist.tracks[index]
      if (!track) return
      // Si ya estaba en el destino, mover igual la quita de la lista actual.
      // Si es la que suena, sigue sonando (solo cambia de lista).
      library.addToList(listId, [track])
      playlist.removeAt(index)
      setNotice(`Movida a «${listName(listId)}»`)
    },
    [playlist, library, listName],
  )

  // Modo mini: barra compacta siempre encima de las demas ventanas.
  const toggleMini = useCallback(() => {
    const next = !mini
    setMini(next)
    void window.winmusic.setMini(next)
  }, [mini])

  // Atajos dentro de la ventana: espacio (play/pausa), flechas izq/der
  // (-/+5 s) y arriba/abajo (volumen). Se ignoran mientras se escribe.
  const { setVolume, volume } = engine
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return
      }
      switch (e.key) {
        case ' ':
          e.preventDefault()
          // Si un boton tiene el foco, el espacio lo "pulsaria" ademas.
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          handleToggle()
          break
        case 'ArrowRight':
        case 'ArrowLeft':
          e.preventDefault()
          if (!e.repeat) seekTo(position + (e.key === 'ArrowRight' ? 5 : -5))
          break
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault()
          setVolume(volume + (e.key === 'ArrowUp' ? 0.05 : -0.05))
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleToggle, seekTo, position, setVolume, volume])

  // Teclas multimedia del teclado (llegan desde el main aunque no haya foco).
  useEffect(
    () =>
      window.winmusic.onMediaCommand((command) => {
        if (command === 'playpause') handleToggle()
        else if (command === 'next') handleNext(true)
        else if (command === 'prev') handlePrev()
        else handleStop()
      }),
    [handleToggle, handleNext, handlePrev, handleStop],
  )

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current
    if (!el) return
    if (document.fullscreenElement) await document.exitFullscreen()
    else await el.requestFullscreen()
  }, [])

  return (
    <div className={`app${mini ? ' app--mini' : ''}`}>
      <TitleBar title={current?.name ?? 'Sin reproduccion'} />

      <div
        ref={stageRef}
        className={`stage${isVideo ? ' stage--video' : ''}`}
      >
        <video
          ref={mediaRef}
          className="stage__media"
          style={{ display: isVideo ? 'block' : 'none' }}
          playsInline
          crossOrigin="anonymous"
          onDoubleClick={toggleFullscreen}
          onClick={(e) => {
            // Evita alternar play en el segundo clic de un doble clic.
            if (e.detail > 1) return
            engine.toggle()
          }}
        />
        {!isVideo && (
          <Visualizer frequencies={engine.frequencies} playing={engine.playing} />
        )}
        {!isVideo && current && !showLyrics && (
          <NowPlaying title={displayTitle} artist={displayArtist} coverUrl={coverUrl} />
        )}
        {!isVideo && current && showLyrics && (
          <LyricsView state={lyrics} getTime={getExactTime} offsetKey={trackKey(current)} />
        )}
        {isVideo && <VideoControls stageRef={stageRef} mediaRef={mediaRef} />}
        {loading && (
          <div className="stage__loading">
            <span className="stage__spinner" />
            <span className="stage__loading-text">Cargando…</span>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel__seekrow">
          <SeekBar
            currentTime={position}
            duration={effectiveDuration}
            onSeek={seekTo}
          />
          <VolumeControl
            volume={engine.volume}
            muted={engine.muted}
            onVolume={engine.setVolume}
            onToggleMute={engine.toggleMute}
          />
        </div>
        <div className="panel__row">
          <Controls
            playing={engine.playing}
            shuffle={playlist.shuffle}
            repeat={playlist.repeat}
            canPlay={playlist.tracks.length > 0}
            onToggle={handleToggle}
            onStop={handleStop}
            onPrev={handlePrev}
            onNext={() => handleNext(true)}
            onToggleShuffle={() => playlist.setShuffle((s) => !s)}
            onCycleRepeat={cycleRepeat}
          />
          <div className="panel__utils">
            <button
              className={`controls__btn${eqOpen ? ' is-active' : ''}`}
              onClick={() => window.winmusic.toggleEqWindow()}
              aria-label="Ecualizador"
              title="Ecualizador"
            >
              <Icon name="equalizer" />
            </button>
            <button
              className={`controls__btn${searchOpen ? ' is-active' : ''}`}
              onClick={() => {
                window.winmusic.toggleSearchWindow()
                setSearchOpen((v) => !v)
              }}
              aria-label="Buscar en YouTube"
              title="Buscar en YouTube"
            >
              <Icon name="search" />
            </button>
            <button
              className={`controls__btn controls__btn--hide-mini${showLyrics ? ' is-active' : ''}`}
              onClick={() => setShowLyrics((v) => !v)}
              aria-label="Letra"
              title="Letra de la cancion"
            >
              <Icon name="lyrics" />
            </button>
            <button
              className="controls__btn controls__btn--hide-mini"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label="Cambiar tema"
              title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <button
              className={`controls__btn${mini ? ' is-active' : ''}`}
              onClick={toggleMini}
              aria-label="Modo mini"
              title={mini ? 'Salir del modo mini' : 'Modo mini (siempre visible)'}
            >
              <Icon name="mini" />
            </button>
          </div>
        </div>
      </div>

      <Playlist
        tracks={playlist.tracks}
        currentIndex={playlist.currentIndex}
        lists={library.lists}
        activeListId={library.activeId}
        activeListName={library.activeName}
        onSelect={playIndex}
        onRemove={handleRemove}
        onMove={playlist.move}
        onAddFiles={addFiles}
        onAddFolder={addFolder}
        onClear={handleClear}
        onSort={playlist.sortBy}
        onSwitchList={handleSwitchList}
        onNewList={handleNewList}
        onRenameList={handleRenameList}
        onDeleteList={handleDeleteList}
        onImportList={handleImportList}
        onExportList={handleExportList}
        onCopyToList={handleCopyToList}
        onMoveToList={handleMoveToList}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
      />

      {dragging && (
        <div className="dropzone">
          <div className="dropzone__box">Suelta archivos o carpetas aquí</div>
        </div>
      )}

      <StatusBar
        version={__APP_VERSION__}
        fadeSeconds={fadeSeconds}
        onCycleFade={cycleFade}
        notice={notice}
      />
    </div>
  )
}
