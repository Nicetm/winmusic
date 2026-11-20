import { useCallback, useEffect, useRef, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Controls } from './components/Controls'
import { SeekBar } from './components/SeekBar'
import { VolumeControl } from './components/VolumeControl'
import { Visualizer } from './components/Visualizer'
import { Playlist } from './components/Playlist'
import { VideoControls, type SubtitlesState } from './components/VideoControls'
import { SubtitleOverlay } from './components/SubtitleOverlay'
import { StatusBar } from './components/StatusBar'
import { Icon } from './components/Icon'
import { createId } from './utils/id'
import { NowPlaying } from './components/NowPlaying'
import { AboutDialog } from './components/AboutDialog'
import { LyricsView, type LyricsState } from './components/LyricsView'
import type { Track, RepeatMode } from './types'
import type {
  YtSearchResult,
  MediaTags,
  M3uEntry,
  ResumeSave,
  SubtitleCue,
} from '../electron/preload'
import { usePlaylist, trackKey } from './hooks/usePlaylist'
import { useLibrary, type NamedList } from './hooks/useLibrary'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useDropFiles } from './hooks/useDropFiles'
import { useRainbowAccent } from './hooks/useRainbowAccent'
import { buildTracks } from './utils/media'
import { useT } from './i18n'

const FADE_STEPS = [0, 2, 4, 6]
const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const SLEEP_STEPS = [0, 15, 30, 45, 60, 90]
/** Segundos que dura el fundido final del temporizador. */
const SLEEP_FADE = 5
/**
 * Segundos antes del fundido cruzado en que se empieza a cargar la cola. Los
 * streams (YouTube, archivos convertidos) tardan mas en arrancar.
 */
const GHOST_LEAD_NATIVE = 5
const GHOST_LEAD_STREAM = 12
/** No se retoma una cancion si quedo a menos de esto del final. */
const RESUME_END_MARGIN = 5

/** Pista pedida para reproducir; el token fuerza reiniciar aunque sea la misma. */
interface PlayRequest {
  token: number
  track: Track | null
  startAt: number
}

/**
 * Como se entrega la pista: directo (con seek nativo por rangos) o como
 * stream de ffmpeg (YouTube y formatos que Chromium no lee), que no admite
 * seek y se reinicia desde el segundo pedido.
 */
interface StreamInfo {
  streamed: boolean
  duration: number | null
}

/** Estado del fundido cruzado de la pista actual. */
interface CrossfadeState {
  phase: 'idle' | 'prepared' | 'done'
  timer: number | null
}

/** URL de reproduccion de una pista, empezando en `startAt` si es un stream. */
function sourceUrl(track: Track, startAt: number, streamed: boolean, audioOnly = false): string {
  const start = Math.floor(startAt)
  if (track.source === 'youtube' && track.videoId) {
    const params = new URLSearchParams()
    if (start > 0) params.set('t', String(start))
    if (track.kind === 'video' && !audioOnly) params.set('v', '1')
    const query = params.toString()
    return `wmedia://youtube/${track.videoId}${query ? `?${query}` : ''}`
  }
  return streamed && start > 0 ? `${track.url}?t=${start}` : track.url
}

export default function App() {
  const { t, lang } = useT()
  const mediaRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  useRainbowAccent()
  const engine = useAudioEngine(mediaRef)
  const playlist = usePlaylist()
  const library = useLibrary(playlist)
  const [mini, setMini] = useState(false)
  const [showLyrics, setShowLyrics] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  // El menu de la bandeja tambien abre "Acerca de".
  useEffect(() => window.winmusic.onShowAbout(() => setShowAbout(true)), [])
  // La bandeja y los dialogos nativos usan el mismo idioma que la interfaz.
  useEffect(() => window.winmusic.setLanguage(lang), [lang])
  const [lyrics, setLyrics] = useState<LyricsState>({ status: 'loading' })
  const [tags, setTags] = useState<MediaTags | null>(null)
  const [fadeSeconds, setFadeSeconds] = useState(() => {
    const saved = Number(localStorage.getItem('wm-fade'))
    return FADE_STEPS.includes(saved) ? saved : 0
  })
  const { dragging } = useDropFiles((paths) => {
    void playlist.addPaths(paths)
  })
  const [eqOpen, setEqOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [stream, setStream] = useState<StreamInfo>({ streamed: false, duration: null })
  // Un stream reiniciado desde un segundo dado cuenta su tiempo desde ahi:
  // este desfase se suma para mostrar la posicion real de la cancion.
  const [streamOffset, setStreamOffset] = useState(0)
  const streamSeekRef = useRef<{ play: boolean; cleanup: () => void } | null>(null)
  const xfadeRef = useRef<CrossfadeState>({ phase: 'idle', timer: null })
  const [subCues, setSubCues] = useState<SubtitleCue[] | null>(null)
  const [subsOn, setSubsOn] = useState(true)
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('wm-theme') as 'dark' | 'light') || 'dark',
  )

  // Aplica el tema al documento y lo persiste.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('wm-theme', theme)
  }, [theme])

  const [playRequest, setPlayRequest] = useState<PlayRequest>({ token: 0, track: null, startAt: 0 })
  const requestPlay = useCallback((track: Track, startAt = 0) => {
    setPlayRequest((r) => ({ token: r.token + 1, track, startAt }))
  }, [])
  const [hydrated, setHydrated] = useState(false)
  // Cancion y segundo donde quedo la sesion anterior (se retoma con Play).
  const resumeRef = useRef<ResumeSave | null>(null)

  // Restaura playlist y audio guardados al iniciar.
  const { hydrate } = playlist
  const { hydrateLibrary } = library
  const { hydrateAudio } = engine
  useEffect(() => {
    let active = true
    window.winmusic.loadState().then((saved) => {
      if (!active) return
      const activeTracks = saved.playlist.tracks as Track[]
      const resume = saved.playlist.resume ?? null
      resumeRef.current = resume
      hydrate({
        tracks: activeTracks,
        // No se autoreproduce: solo se marca la cancion donde quedo.
        currentIndex: resume ? activeTracks.findIndex((tr) => trackKey(tr) === resume.key) : -1,
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
        playbackRate: saved.audio.playbackRate,
      })
      setHydrated(true)
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
    if (!hydrated) return
    window.winmusic.savePlaylist({
      tracks: playlist.tracks,
      currentIndex: playlist.currentIndex,
      shuffle: playlist.shuffle,
      repeat: playlist.repeat,
      lists: library.lists,
      activeId: library.activeId,
    })
  }, [
    hydrated,
    playlist.tracks,
    playlist.currentIndex,
    playlist.shuffle,
    playlist.repeat,
    library.lists,
    library.activeId,
  ])

  // Guarda el estado de audio (volumen, mute, EQ, velocidad) cuando cambia.
  useEffect(() => {
    if (!hydrated) return
    window.winmusic.saveAudio({
      volume: engine.volume,
      muted: engine.muted,
      eqGains: engine.eqGains,
      eqPreset: engine.eqPreset,
      playbackRate: engine.playbackRate,
    })
  }, [hydrated, engine.volume, engine.muted, engine.eqGains, engine.eqPreset, engine.playbackRate])

  // Pista que esta sonando. Es independiente de la lista visible: al cambiar
  // de lista sigue sonando aunque no este en la nueva.
  const [playingTrack, setPlayingTrack] = useState<Track | null>(null)
  const current = playingTrack

  // Lista vigente para los callbacks asincronos (se actualiza en cada render).
  const tracksRef = useRef(playlist.tracks)
  tracksRef.current = playlist.tracks

  // Resalta en la lista visible la pista que suena (o nada si no esta ahi).
  const { tracks: visibleTracks, setCurrentIndex } = playlist
  useEffect(() => {
    if (!playingTrack) return
    const key = trackKey(playingTrack)
    setCurrentIndex(visibleTracks.findIndex((tr) => trackKey(tr) === key))
  }, [playingTrack, visibleTracks, library.activeId, setCurrentIndex])

  const offset = stream.streamed ? streamOffset : 0
  const position = engine.currentTime + offset

  // Guarda donde va la cancion cada 5 s (y al pausar) para retomarla al
  // volver a abrir la app.
  const positionRef = useRef(position)
  positionRef.current = position
  const resumeBucket = Math.floor(position / 5)
  useEffect(() => {
    // Mientras carga, la posicion aun es la de la pista anterior.
    if (!hydrated || !playingTrack || loading) return
    window.winmusic.saveResume({ key: trackKey(playingTrack), position: positionRef.current })
  }, [hydrated, playingTrack, loading, resumeBucket, engine.playing])

  // Posicion que se esta escuchando: leida directo del elemento (mas precisa
  // que `position`, que llega con timeupdate cada ~250 ms) y descontando el
  // retardo de salida del audio. La usan las letras y los subtitulos.
  const { getOutputLatency } = engine
  const getExactTime = useCallback(
    () => (mediaRef.current?.currentTime ?? 0) + offset - getOutputLatency(),
    [offset, getOutputLatency],
  )

  const {
    disposeGhost,
    prepareGhost,
    startGhostTail,
    play: enginePlay,
    pause: enginePause,
    fadeTo: engineFadeTo,
    seek: engineSeek,
  } = engine

  /** Anula el fundido cruzado en curso (al adelantar o detener). */
  const cancelCrossfade = useCallback(() => {
    const x = xfadeRef.current
    if (x.timer != null) window.clearTimeout(x.timer)
    xfadeRef.current = { phase: 'idle', timer: null }
    disposeGhost()
  }, [disposeGhost])

  // Salta a un segundo de la pista actual. Los archivos directos usan el seek
  // nativo; los streams se reinician desde ese punto (ffmpeg -ss).
  const seekTo = useCallback(
    (time: number) => {
      const media = mediaRef.current
      if (!media || !media.src || !current) return
      const target = Math.max(0, time)
      cancelCrossfade()
      // Si estaba en pleno fundido de salida, el salto recupera el volumen.
      engineFadeTo(1, 0.15)
      if (!stream.streamed) {
        engineSeek(target)
        return
      }
      // Si hay un salto pendiente, se respeta su intencion de reproducir.
      const shouldPlay = streamSeekRef.current ? streamSeekRef.current.play : !media.paused
      streamSeekRef.current?.cleanup()

      const onCanPlay = () => {
        streamSeekRef.current = null
        if (shouldPlay) enginePlay()
        else setLoading(false)
      }
      const onError = () => {
        streamSeekRef.current = null
        setLoading(false)
      }
      media.addEventListener('canplay', onCanPlay, { once: true })
      media.addEventListener('error', onError, { once: true })
      streamSeekRef.current = {
        play: shouldPlay,
        cleanup: () => {
          media.removeEventListener('canplay', onCanPlay)
          media.removeEventListener('error', onError)
        },
      }

      setStreamOffset(Math.floor(target))
      setLoading(true)
      media.src = sourceUrl(current, target, true)
      media.load()
    },
    [current, stream.streamed, cancelCrossfade, engineFadeTo, engineSeek, enginePlay],
  )

  /**
   * Reproduce la pista de la lista visible. `resume`: si es la cancion donde
   * quedo la sesion anterior, sigue desde ese segundo (boton Play).
   */
  const playIndex = useCallback(
    (index: number, resume = false) => {
      const track = playlist.tracks[index]
      if (!track) return
      const saved = resumeRef.current
      resumeRef.current = null
      const nearEnd = track.duration != null && saved != null && saved.position > track.duration - RESUME_END_MARGIN
      const startAt = resume && saved && saved.key === trackKey(track) && !nearEnd ? saved.position : 0
      playlist.setCurrentIndex(index)
      requestPlay(track, startAt)
    },
    [playlist, requestPlay],
  )

  const handleNext = useCallback(
    (manual: boolean) => {
      const next = playlist.pickNextIndex(manual)
      if (next === -1) {
        enginePause()
        return
      }
      playIndex(next)
    },
    [playlist, enginePause, playIndex],
  )
  const handleNextRef = useRef(handleNext)
  handleNextRef.current = handleNext

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
    playIndex(index, true)
  }, [engine, playlist.currentIndex, playIndex])

  const handlePrev = useCallback(() => {
    if (position > 3) {
      seekTo(0)
      return
    }
    const prev = playlist.pickPrevIndex()
    if (prev !== -1) playIndex(prev)
  }, [playlist, position, seekTo, playIndex])

  const handleStop = useCallback(() => {
    enginePause()
    seekTo(0)
  }, [enginePause, seekTo])

  /** Detiene y vacia el elemento media (al quedar sin pista actual). */
  const clearMedia = useCallback(() => {
    const media = mediaRef.current
    if (!media) return
    streamSeekRef.current?.cleanup()
    streamSeekRef.current = null
    cancelCrossfade()
    setStreamOffset(0)
    setPlayingTrack(null)
    window.winmusic.saveResume(null)
    media.pause()
    media.removeAttribute('src')
    media.load()
  }, [cancelCrossfade])

  // Quita pistas; si una era la que sonaba, detiene y limpia el reproductor.
  const handleRemove = useCallback(
    (indices: number[]) => {
      const wasCurrent = indices.includes(playlist.currentIndex)
      playlist.removeMany(indices)
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

  // Ref para que cambiar el fundido no re-ejecute la carga de la pista.
  const fadeSecondsRef = useRef(fadeSeconds)
  useEffect(() => {
    fadeSecondsRef.current = fadeSeconds
    localStorage.setItem('wm-fade', String(fadeSeconds))
  }, [fadeSeconds])

  // Carga y reproduce la pista pedida. Los archivos locales se consultan
  // antes para saber si se entregan directo o convertidos por ffmpeg.
  const { setDuration } = playlist
  useEffect(() => {
    const { track, startAt } = playRequest
    const media = mediaRef.current
    if (playRequest.token === 0 || !track || !media) return
    let cancelled = false
    setPlayingTrack(track)

    // Una pista nueva anula cualquier salto pendiente. Si la anterior dejo su
    // cola sonando (fundido cruzado) se respeta; si solo estaba preparada, sobra.
    streamSeekRef.current?.cleanup()
    streamSeekRef.current = null
    const x = xfadeRef.current
    if (x.timer != null) window.clearTimeout(x.timer)
    if (x.phase === 'prepared') disposeGhost()
    xfadeRef.current = { phase: 'idle', timer: null }
    setSubCues(null)
    setSubsOn(true)
    setLoading(true)

    let streamed = track.source === 'youtube'
    const onLoadedMeta = () => {
      if (!streamed && startAt > 0) media.currentTime = startAt
    }
    const onCanPlay = () => {
      enginePlay()
      // Fundido de entrada (o volumen completo si esta desactivado).
      const fade = fadeSecondsRef.current
      if (fade > 0) engineFadeTo(1, fade, 0)
      else engineFadeTo(1, 0.01, 1)
    }
    const onPlaying = () => setLoading(false)
    const onError = () => setLoading(false)

    const start = async () => {
      let duration = track.duration
      if (track.source === 'local') {
        try {
          const probe = await window.winmusic.probeMedia(track.path)
          streamed = !probe.nativePlayable
          if (streamed && probe.duration) {
            duration = probe.duration
            setDuration(track.id, probe.duration)
          }
        } catch (err) {
          // Sin datos del archivo se intenta directo; si no existe, el
          // elemento media dispara su propio error.
          console.warn('[winmusic] no se pudo analizar el archivo:', err)
        }
        if (track.kind === 'video') {
          window.winmusic
            .findSubtitles(track.path)
            .then((cues) => !cancelled && cues && setSubCues(cues))
            .catch((err) => console.warn('[winmusic] no se pudieron leer los subtitulos:', err))
        }
      }
      if (cancelled) return
      setStream({ streamed, duration })
      setStreamOffset(streamed ? Math.floor(startAt) : 0)
      media.addEventListener('loadedmetadata', onLoadedMeta, { once: true })
      media.addEventListener('canplay', onCanPlay, { once: true })
      media.addEventListener('playing', onPlaying)
      media.addEventListener('error', onError)
      media.src = sourceUrl(track, startAt, streamed)
      media.load()
    }
    void start()

    return () => {
      cancelled = true
      media.removeEventListener('loadedmetadata', onLoadedMeta)
      media.removeEventListener('canplay', onCanPlay)
      media.removeEventListener('playing', onPlaying)
      media.removeEventListener('error', onError)
    }
  }, [playRequest, enginePlay, engineFadeTo, disposeGhost, setDuration])

  // Guarda la duracion de los archivos directos cuando el metadata esta
  // disponible. En los streams no sirve: es solo lo que queda desde el salto.
  useEffect(() => {
    const media = mediaRef.current
    if (!media || !current || stream.streamed) return
    const onMeta = () => {
      if (Number.isFinite(media.duration)) setDuration(current.id, media.duration)
    }
    media.addEventListener('loadedmetadata', onMeta)
    return () => media.removeEventListener('loadedmetadata', onMeta)
  }, [current, stream.streamed, setDuration])

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

  // Archivos abiertos desde el Explorador: se agregan a la lista activa (sin
  // duplicar) y suena el primero.
  const { appendTracks } = playlist
  const openPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      const existing = new Map(tracksRef.current.map((tr) => [trackKey(tr), tr]))
      const tracks = (await buildTracks(paths)).map((tr) => existing.get(trackKey(tr)) ?? tr)
      appendTracks(tracks.filter((tr) => !existing.has(trackKey(tr))))
      requestPlay(tracks[0])
    },
    [appendTracks, requestPlay],
  )
  useEffect(() => {
    if (!hydrated) return
    void window.winmusic.takeLaunchFiles().then(openPaths)
    return window.winmusic.onOpenFiles((paths) => void openPaths(paths))
  }, [hydrated, openPaths])

  const cycleRepeat = useCallback(() => {
    playlist.setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
  }, [playlist])

  const ytResultToTrack = useCallback((r: YtSearchResult, asVideo: boolean): Track => {
    return {
      id: createId(),
      path: `youtube:${r.id}`,
      url: '',
      name: r.title,
      ext: '',
      kind: asVideo ? 'video' : 'audio',
      duration: r.duration,
      source: 'youtube',
      videoId: r.id,
    }
  }, [])

  const addYoutube = useCallback(
    (r: YtSearchResult, asVideo: boolean) => {
      playlist.addTrack(ytResultToTrack(r, asVideo))
    },
    [playlist, ytResultToTrack],
  )

  // Puente IPC con la ventana del buscador de YouTube.
  useEffect(() => {
    const offAdd = window.winmusic.onSearchAddResult((r, asVideo) => {
      addYoutube(r, asVideo)
      setSearchOpen(true)
    })
    const offClosed = window.winmusic.onSearchWindowClosed(() => setSearchOpen(false))
    const offState = window.winmusic.onWindowsOpenState((s) => {
      setSearchOpen(s.search)
      setEqOpen(s.eq)
    })
    return () => {
      offAdd()
      offClosed()
      offState()
    }
  }, [addYoutube])

  const isVideo = current?.kind === 'video'
  const isYoutube = current?.source === 'youtube' && !!current.videoId

  // En los streams la duracion real viene de la busqueda o de ffprobe (el
  // elemento solo ve lo que queda tras adelantar). En los directos, la del
  // elemento.
  const effectiveDuration =
    stream.streamed && stream.duration
      ? stream.duration
      : engine.duration > 0 && Number.isFinite(engine.duration)
        ? engine.duration
        : (current?.duration ?? 0)

  /**
   * Fundido cruzado: unos segundos antes se prepara en silencio la cola de la
   * cancion actual desde el punto de cruce. Al llegar ahi, la cola sigue
   * sonando mientras baja y la siguiente entra con su fundido de entrada. Si
   * la cola no alcanzo a cargar, la cancion se apaga sola hasta terminar.
   */
  const enginePlaying = engine.playing
  const { pickNextIndex } = playlist
  const playbackRate = engine.playbackRate
  useEffect(() => {
    const x = xfadeRef.current
    if (!enginePlaying) {
      // Pausar descarta la cola preparada; se vuelve a preparar al seguir.
      if (x.timer != null) window.clearTimeout(x.timer)
      x.timer = null
      if (x.phase === 'prepared') x.phase = 'idle'
      return
    }
    // Mientras carga, la posicion y la duracion aun son de la pista anterior.
    if (loading || fadeSeconds <= 0 || effectiveDuration <= 0 || !current || x.phase === 'done') return
    const crossAt = Math.floor(effectiveDuration - fadeSeconds)
    if (crossAt <= 0 || position >= effectiveDuration) return

    const lead = stream.streamed ? GHOST_LEAD_STREAM : GHOST_LEAD_NATIVE
    if (x.phase === 'idle' && position >= crossAt - lead && position < crossAt - 1) {
      if (pickNextIndex(false) !== -1) {
        prepareGhost(sourceUrl(current, crossAt, stream.streamed, true), crossAt, !stream.streamed)
        x.phase = 'prepared'
      }
    }

    // Cerca del cruce se programa el momento exacto (timeupdate es impreciso).
    if (position >= crossAt - 1 && x.timer == null) {
      const exact = (mediaRef.current?.currentTime ?? 0) + offset
      const delay = Math.max(0, ((crossAt - exact) / playbackRate) * 1000)
      x.timer = window.setTimeout(() => {
        x.timer = null
        x.phase = 'done'
        if (startGhostTail(fadeSeconds)) {
          handleNextRef.current(false)
        } else {
          disposeGhost()
          engineFadeTo(0, Math.max(0.1, (effectiveDuration - crossAt) / playbackRate))
        }
      }, delay)
    }
  }, [
    position,
    effectiveDuration,
    fadeSeconds,
    enginePlaying,
    loading,
    current,
    stream.streamed,
    offset,
    playbackRate,
    pickNextIndex,
    prepareGhost,
    startGhostTail,
    disposeGhost,
    engineFadeTo,
  ])

  const cycleFade = useCallback(() => {
    setFadeSeconds((s) => FADE_STEPS[(FADE_STEPS.indexOf(s) + 1) % FADE_STEPS.length])
  }, [])

  const { setPlaybackRate } = engine
  const cycleSpeed = useCallback(() => {
    const index = SPEED_STEPS.indexOf(playbackRate)
    setPlaybackRate(SPEED_STEPS[(index + 1) % SPEED_STEPS.length] ?? 1)
  }, [playbackRate, setPlaybackRate])

  // Mensaje breve en la barra de estado (resultado de importar/exportar).
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => window.winmusic.onNotice(setNotice), [])
  useEffect(() => {
    if (!notice) return
    const id = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(id)
  }, [notice])

  // Temporizador para dormir: al cumplirse, baja el volumen y pausa.
  const [sleep, setSleep] = useState<{ minutes: number; endsAt: number } | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!sleep) return
    const id = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [sleep])
  const sleepPauseRef = useRef<number | null>(null)
  useEffect(() => {
    if (!sleep || clock < sleep.endsAt) return
    setSleep(null)
    setNotice(t('notice.sleepDone'))
    engineFadeTo(0, SLEEP_FADE)
    sleepPauseRef.current = window.setTimeout(() => {
      sleepPauseRef.current = null
      enginePause()
      engineFadeTo(1, 0.01)
    }, SLEEP_FADE * 1000)
  }, [clock, sleep, t, engineFadeTo, enginePause])
  useEffect(
    () => () => {
      if (sleepPauseRef.current != null) window.clearTimeout(sleepPauseRef.current)
    },
    [],
  )

  const cycleSleep = useCallback(() => {
    const index = SLEEP_STEPS.indexOf(sleep?.minutes ?? 0)
    const minutes = SLEEP_STEPS[(index + 1) % SLEEP_STEPS.length]
    const now = Date.now()
    setClock(now)
    setSleep(minutes > 0 ? { minutes, endsAt: now + minutes * 60_000 } : null)
  }, [sleep])
  const sleepMinutesLeft = sleep ? Math.max(1, Math.ceil((sleep.endsAt - clock) / 60_000)) : null

  // Subtitulos: si no hay cargados se elige un archivo; si hay, se muestran u ocultan.
  const handleSubtitles = useCallback(async () => {
    if (subCues) {
      setSubsOn((on) => !on)
      return
    }
    try {
      const cues = await window.winmusic.openSubtitles()
      if (!cues) return
      if (cues.length === 0) {
        setNotice(t('notice.subtitlesFailed'))
        return
      }
      setSubCues(cues)
      setSubsOn(true)
      setNotice(t('notice.subtitlesLoaded'))
    } catch (err) {
      console.error('[winmusic] error al cargar subtitulos:', err)
      setNotice(t('notice.subtitlesFailed'))
    }
  }, [subCues, t])
  const subtitlesState: SubtitlesState = subCues ? (subsOn ? 'on' : 'off') : 'none'

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
      .then((tg) => active && setTags(tg))
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
        playlist.tracks.map((tr) => ({
          path: tr.path,
          name: tr.name,
          duration: tr.duration,
          source: tr.source,
          videoId: tr.videoId,
        })),
      )
      if (saved) setNotice(t('notice.listExported'))
    } catch (err) {
      console.error('[winmusic] error al exportar la lista:', err)
      setNotice(t('notice.listExportFailed'))
    }
  }, [library.activeName, playlist.tracks, t])

  // Importa un .m3u como lista nueva, conservando el orden del archivo.
  const handleImportList = useCallback(async () => {
    try {
      const result = await window.winmusic.importPlaylist()
      if (!result) return
      const filePaths = result.entries
        .filter((e): e is Extract<M3uEntry, { kind: 'file' }> => e.kind === 'file')
        .map((e) => e.path)
      const fileTracks = new Map((await buildTracks(filePaths)).map((tr) => [tr.path, tr]))
      const seen = new Set<string>()
      const tracks: Track[] = []
      for (const e of result.entries) {
        const key = e.kind === 'file' ? `file:${e.path}` : `yt:${e.videoId}`
        if (seen.has(key)) continue
        seen.add(key)
        const track =
          e.kind === 'file'
            ? fileTracks.get(e.path)
            : ytResultToTrack({ id: e.videoId, title: e.title, duration: e.duration, channel: null }, false)
        if (track) tracks.push(track)
      }
      library.create(result.name, tracks)
      setNotice(t('notice.listImported', { n: tracks.length }))
    } catch (err) {
      console.error('[winmusic] error al importar la lista:', err)
      setNotice(t('notice.listImportFailed'))
    }
  }, [library, ytResultToTrack, t])

  // Respaldo completo (todas las listas, ecualizador y volumen) en un archivo.
  const handleExportBackup = useCallback(async () => {
    try {
      if (await window.winmusic.exportBackup()) setNotice(t('notice.backupExported'))
    } catch (err) {
      console.error('[winmusic] error al exportar el respaldo:', err)
      setNotice(t('notice.backupExportFailed'))
    }
  }, [t])

  // Si se importa, el main recarga la ventana con los datos nuevos.
  const handleImportBackup = useCallback(async () => {
    try {
      const result = await window.winmusic.importBackup()
      if (result === 'invalid') setNotice(t('notice.backupInvalid'))
    } catch (err) {
      console.error('[winmusic] error al importar el respaldo:', err)
      setNotice(t('notice.backupImportFailed'))
    }
  }, [t])

  // Copiar / mover canciones de la lista activa a otra lista.
  const listName = useCallback(
    (id: string) => library.lists.find((l) => l.id === id)?.name ?? '',
    [library.lists],
  )

  const handleCopyToList = useCallback(
    (indices: number[], listId: string) => {
      const tracks = indices.map((i) => playlist.tracks[i]).filter((tr): tr is Track => !!tr)
      if (tracks.length === 0) return
      const added = library.addToList(listId, tracks)
      const list = listName(listId)
      if (added === 0) setNotice(t('notice.alreadyIn', { list }))
      else if (added === 1) setNotice(t('notice.copiedTo', { list }))
      else setNotice(t('notice.copiedManyTo', { n: added, list }))
    },
    [playlist.tracks, library, listName, t],
  )

  const handleMoveToList = useCallback(
    (indices: number[], listId: string) => {
      const tracks = indices.map((i) => playlist.tracks[i]).filter((tr): tr is Track => !!tr)
      if (tracks.length === 0) return
      // Si ya estaban en el destino, mover igual las quita de la lista actual.
      // Si una es la que suena, sigue sonando (solo cambia de lista).
      library.addToList(listId, tracks)
      playlist.removeMany(indices)
      const list = listName(listId)
      setNotice(
        tracks.length === 1
          ? t('notice.movedTo', { list })
          : t('notice.movedManyTo', { n: tracks.length, list }),
      )
    },
    [playlist, library, listName, t],
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
      // Con un dialogo abierto (Acerca de, confirmaciones) no actuan los atajos.
      if (document.querySelector('.dialog')) return
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
      <TitleBar title={current?.name ?? t('win.noPlayback')} />

      <div ref={stageRef} className={`stage${isVideo ? ' stage--video' : ''}`}>
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
        {!isVideo && <Visualizer frequencies={engine.frequencies} playing={engine.playing} />}
        {!isVideo && current && !showLyrics && (
          <NowPlaying title={displayTitle} artist={displayArtist} coverUrl={coverUrl} />
        )}
        {!isVideo && current && showLyrics && (
          <LyricsView state={lyrics} getTime={getExactTime} offsetKey={trackKey(current)} />
        )}
        {isVideo && subCues && subsOn && <SubtitleOverlay cues={subCues} getTime={getExactTime} />}
        {isVideo && (
          <VideoControls
            stageRef={stageRef}
            mediaRef={mediaRef}
            subtitles={subtitlesState}
            onSubtitles={() => void handleSubtitles()}
          />
        )}
        {loading && (
          <div className="stage__loading">
            <span className="stage__spinner" />
            <span className="stage__loading-text">{t('stage.loading')}</span>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel__seekrow">
          <SeekBar currentTime={position} duration={effectiveDuration} onSeek={seekTo} />
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
              aria-label={t('ctl.eq')}
              title={t('ctl.eq')}
            >
              <Icon name="equalizer" />
            </button>
            <button
              className={`controls__btn${searchOpen ? ' is-active' : ''}`}
              onClick={() => {
                window.winmusic.toggleSearchWindow()
                setSearchOpen((v) => !v)
              }}
              aria-label={t('ctl.search')}
              title={t('ctl.search')}
            >
              <Icon name="search" />
            </button>
            <button
              className={`controls__btn controls__btn--hide-mini${showLyrics ? ' is-active' : ''}`}
              onClick={() => setShowLyrics((v) => !v)}
              aria-label={t('ctl.lyrics')}
              title={t('ctl.lyrics')}
            >
              <Icon name="lyrics" />
            </button>
            <button
              className="controls__btn controls__btn--hide-mini"
              onClick={() => setTheme((th) => (th === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? t('ctl.themeLight') : t('ctl.themeDark')}
              title={theme === 'dark' ? t('ctl.themeLight') : t('ctl.themeDark')}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <button
              className={`controls__btn${mini ? ' is-active' : ''}`}
              onClick={toggleMini}
              aria-label={mini ? t('ctl.miniOff') : t('ctl.miniOn')}
              title={mini ? t('ctl.miniOff') : t('ctl.miniOn')}
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
        onMoveMany={playlist.moveMany}
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
          <div className="dropzone__box">{t('stage.drop')}</div>
        </div>
      )}

      <StatusBar
        version={__APP_VERSION__}
        fadeSeconds={fadeSeconds}
        onCycleFade={cycleFade}
        playbackRate={playbackRate}
        onCycleSpeed={cycleSpeed}
        sleepMinutesLeft={sleepMinutesLeft}
        onCycleSleep={cycleSleep}
        notice={notice}
        onShowAbout={() => setShowAbout(true)}
      />

      {showAbout && <AboutDialog version={__APP_VERSION__} onClose={() => setShowAbout(false)} />}
    </div>
  )
}
