import { useCallback, useEffect, useRef, useState } from 'react'

import { EQ_BANDS, flatGains, DEFAULT_PRESET, type EqGains } from '../audio/equalizer'

export interface AudioEngine {
  mediaRef: React.RefObject<HTMLMediaElement | null>
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  frequencies: Uint8Array<ArrayBuffer>
  eqGains: EqGains
  eqPreset: string
  play: () => void
  pause: () => void
  toggle: () => void
  seek: (time: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  setBandGain: (index: number, gainDb: number) => void
  setAllGains: (gains: EqGains) => void
  setEqPreset: (name: string) => void
  fadeTo: (value: number, seconds: number, from?: number) => void
  getOutputLatency: () => number
  playbackRate: number
  setPlaybackRate: (rate: number) => void
  prepareGhost: (url: string, startAt: number, seekable: boolean) => void
  startGhostTail: (seconds: number) => boolean
  disposeGhost: () => void
  hydrateAudio: (data: AudioHydration) => void
}

export interface AudioHydration {
  volume: number
  muted: boolean
  eqGains: EqGains
  eqPreset: string
  playbackRate: number
}

/** Reproductor auxiliar que hace sonar la cola de la cancion anterior. */
interface Ghost {
  el: HTMLAudioElement
  source: MediaElementAudioSourceNode
  gain: GainNode
  timer: number | null
}

const FFT_SIZE = 512

/**
 * Conecta un elemento <audio>/<video> a la Web Audio API para extraer el
 * espectro de frecuencias usado por el visualizador, y expone controles
 * de reproduccion con estado sincronizado al elemento media.
 */
export function useAudioEngine(
  mediaRef: React.RefObject<HTMLMediaElement | null>,
): AudioEngine {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(1)
  const [muted, setMuted] = useState(false)
  const [frequencies, setFrequencies] = useState<Uint8Array<ArrayBuffer>>(
    () => new Uint8Array(new ArrayBuffer(FFT_SIZE / 2)),
  )
  const [eqGains, setEqGains] = useState<EqGains>(() => flatGains())
  const [eqPreset, setEqPresetState] = useState<string>(DEFAULT_PRESET)
  const [playbackRate, setPlaybackRateState] = useState(1)

  // Ref siempre actualizado a las ganancias, para que ensureAnalyser no las
  // tenga como dependencia (si no, cambiar el preset recreaba play() y el
  // efecto de carga reiniciaba el audio).
  const eqGainsRef = useRef(eqGains)
  useEffect(() => {
    eqGainsRef.current = eqGains
  }, [eqGains])

  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const filtersRef = useRef<BiquadFilterNode[]>([])
  const fadeRef = useRef<GainNode | null>(null)
  const ghostRef = useRef<Ghost | null>(null)
  const rafRef = useRef<number | null>(null)
  const dataRef = useRef<Uint8Array<ArrayBuffer>>(
    new Uint8Array(new ArrayBuffer(FFT_SIZE / 2)),
  )

  const ensureAnalyser = useCallback(() => {
    const media = mediaRef.current
    if (!media) return
    if (!audioCtxRef.current) {
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      const source = ctx.createMediaElementSource(media)

      // Cadena de filtros EQ: lowshelf, peaking..., highshelf.
      const filters = EQ_BANDS.map((freq, i) => {
        const filter = ctx.createBiquadFilter()
        if (i === 0) {
          filter.type = 'lowshelf'
        } else if (i === EQ_BANDS.length - 1) {
          filter.type = 'highshelf'
        } else {
          filter.type = 'peaking'
          filter.Q.value = 1.0
        }
        filter.frequency.value = freq
        filter.gain.value = 0
        return filter
      })

      // source -> fade -> f0 -> ... -> fN -> analyser -> destination
      // El fundido va antes del EQ: la cola de la cancion anterior (fundido
      // cruzado) entra al EQ con su propio volumen, sin pasar por este.
      const fade = ctx.createGain()
      source.connect(fade)
      const last = filters.reduce<AudioNode>((prev, node) => {
        prev.connect(node)
        return node
      }, fade)
      last.connect(analyser)
      analyser.connect(ctx.destination)
      fadeRef.current = fade

      audioCtxRef.current = ctx
      analyserRef.current = analyser
      sourceRef.current = source
      filtersRef.current = filters
      dataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))

      // Aplica las ganancias actuales por si se ajustaron antes de reproducir.
      filters.forEach((f, i) => {
        f.gain.value = eqGainsRef.current[i] ?? 0
      })
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume()
    }
  }, [mediaRef])

  const loop = useCallback(() => {
    const analyser = analyserRef.current
    if (analyser) {
      analyser.getByteFrequencyData(dataRef.current)
      setFrequencies(dataRef.current.slice())
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [])

  const play = useCallback(() => {
    const media = mediaRef.current
    if (!media) return
    ensureAnalyser()
    // play() rechaza con AbortError si una nueva carga lo interrumpe; se ignora.
    media.play().catch(() => undefined)
  }, [mediaRef, ensureAnalyser])

  const disposeGhost = useCallback(() => {
    const ghost = ghostRef.current
    if (!ghost) return
    ghostRef.current = null
    if (ghost.timer != null) window.clearTimeout(ghost.timer)
    ghost.el.pause()
    ghost.el.removeAttribute('src')
    ghost.el.load()
    ghost.source.disconnect()
    ghost.gain.disconnect()
  }, [])

  /**
   * Prepara en silencio la cola de la cancion actual desde `startAt` (para el
   * fundido cruzado). `seekable`: el archivo admite saltar con currentTime;
   * si no (stream de ffmpeg), la URL ya debe empezar en ese punto.
   */
  const prepareGhost = useCallback(
    (url: string, startAt: number, seekable: boolean) => {
      disposeGhost()
      const ctx = audioCtxRef.current
      const media = mediaRef.current
      const eqInput = filtersRef.current[0]
      if (!ctx || !media || !eqInput) return
      const el = new Audio()
      el.crossOrigin = 'anonymous'
      el.preload = 'auto'
      el.volume = media.volume
      el.muted = media.muted
      el.defaultPlaybackRate = media.playbackRate
      const source = ctx.createMediaElementSource(el)
      const gain = ctx.createGain()
      gain.gain.value = 0
      source.connect(gain)
      gain.connect(eqInput)
      if (seekable) {
        el.addEventListener('loadedmetadata', () => (el.currentTime = startAt), { once: true })
      }
      el.src = url
      ghostRef.current = { el, source, gain, timer: null }
    },
    [mediaRef, disposeGhost],
  )

  /**
   * Hace sonar la cola preparada bajando su volumen hasta 0 en `seconds`.
   * Devuelve false si todavia no tiene datos para sonar sin cortes.
   */
  const startGhostTail = useCallback(
    (seconds: number): boolean => {
      const ghost = ghostRef.current
      const ctx = audioCtxRef.current
      if (!ghost || !ctx) return false
      if (ghost.el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || ghost.el.seeking) return false
      ghost.el.play().catch(() => undefined)
      const now = ctx.currentTime
      ghost.gain.gain.setValueAtTime(fadeRef.current?.gain.value ?? 1, now)
      ghost.gain.gain.linearRampToValueAtTime(0, now + seconds)
      ghost.timer = window.setTimeout(disposeGhost, seconds * 1000)
      return true
    },
    [disposeGhost],
  )

  const pause = useCallback(() => {
    disposeGhost()
    mediaRef.current?.pause()
  }, [mediaRef, disposeGhost])

  const setPlaybackRate = useCallback(
    (rate: number) => {
      setPlaybackRateState(rate)
      const media = mediaRef.current
      if (!media) return
      // defaultPlaybackRate se conserva al cargar otra pista; playbackRate no.
      media.defaultPlaybackRate = rate
      media.playbackRate = rate
    },
    [mediaRef],
  )

  const toggle = useCallback(() => {
    const media = mediaRef.current
    if (!media) return
    if (media.paused) play()
    else pause()
  }, [mediaRef, play, pause])

  const seek = useCallback(
    (time: number) => {
      const media = mediaRef.current
      if (!media) return
      media.currentTime = time
      setCurrentTime(time)
    },
    [mediaRef],
  )

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.min(1, Math.max(0, v))
      setVolumeState(clamped)
      const media = mediaRef.current
      if (media) {
        media.volume = clamped
        if (clamped > 0 && media.muted) {
          media.muted = false
          setMuted(false)
        }
      }
    },
    [mediaRef],
  )

  const toggleMute = useCallback(() => {
    const media = mediaRef.current
    if (!media) return
    media.muted = !media.muted
    setMuted(media.muted)
  }, [mediaRef])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return

    const onPlay = () => {
      setPlaying(true)
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop)
    }
    const onPause = () => setPlaying(false)
    const onTime = () => setCurrentTime(media.currentTime)
    const onMeta = () => setDuration(media.duration || 0)
    const onVolume = () => {
      setVolumeState(media.volume)
      setMuted(media.muted)
    }
    // Al vaciar el media (quitar pista): resetea tiempo, duracion y estado.
    const onEmptied = () => {
      setPlaying(false)
      setCurrentTime(0)
      setDuration(0)
    }

    media.addEventListener('play', onPlay)
    media.addEventListener('pause', onPause)
    media.addEventListener('timeupdate', onTime)
    media.addEventListener('loadedmetadata', onMeta)
    media.addEventListener('emptied', onEmptied)
    media.addEventListener('durationchange', onMeta)
    media.addEventListener('volumechange', onVolume)

    return () => {
      media.removeEventListener('play', onPlay)
      media.removeEventListener('pause', onPause)
      media.removeEventListener('timeupdate', onTime)
      media.removeEventListener('loadedmetadata', onMeta)
      media.removeEventListener('durationchange', onMeta)
      media.removeEventListener('volumechange', onVolume)
      media.removeEventListener('emptied', onEmptied)
    }
  }, [mediaRef, loop])

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      void audioCtxRef.current?.close()
    }
  }, [])

  const setBandGain = useCallback((index: number, gainDb: number) => {
    setEqGains((prev) => {
      const next = [...prev]
      next[index] = gainDb
      return next
    })
    setEqPresetState('Personalizado')
    const filter = filtersRef.current[index]
    if (filter) filter.gain.value = gainDb
  }, [])

  const setAllGains = useCallback((gains: EqGains) => {
    setEqGains([...gains])
    filtersRef.current.forEach((f, i) => {
      f.gain.value = gains[i] ?? 0
    })
  }, [])

  const setEqPreset = useCallback((name: string) => {
    setEqPresetState(name)
  }, [])

  /**
   * Retardo entre la posicion del elemento y el sonido que realmente sale por
   * los parlantes (buffers de Web Audio + salida del sistema), en segundos.
   */
  const getOutputLatency = useCallback((): number => {
    const ctx = audioCtxRef.current
    if (!ctx) return 0
    return (ctx.baseLatency || 0) + (ctx.outputLatency || 0)
  }, [])

  /**
   * Lleva el volumen de fundido a `value` (0..1) en `seconds` segundos,
   * partiendo de `from` si se indica o del valor actual.
   */
  const fadeTo = useCallback((value: number, seconds: number, from?: number) => {
    const ctx = audioCtxRef.current
    const gain = fadeRef.current?.gain
    if (!ctx || !gain) return
    const now = ctx.currentTime
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(from ?? gain.value, now)
    gain.linearRampToValueAtTime(value, now + Math.max(0.01, seconds))
  }, [])

  const hydrateAudio = useCallback(
    (data: AudioHydration) => {
      setVolumeState(data.volume)
      setMuted(data.muted)
      if (data.eqGains.length > 0) setEqGains(data.eqGains)
      setEqPresetState(data.eqPreset)
      setPlaybackRate(data.playbackRate)
      const media = mediaRef.current
      if (media) {
        media.volume = data.volume
        media.muted = data.muted
      }
      filtersRef.current.forEach((f, i) => {
        f.gain.value = data.eqGains[i] ?? 0
      })
    },
    [mediaRef, setPlaybackRate],
  )

  return {
    mediaRef,
    playing,
    currentTime,
    duration,
    volume,
    muted,
    frequencies,
    eqGains,
    eqPreset,
    play,
    pause,
    toggle,
    seek,
    setVolume,
    toggleMute,
    setBandGain,
    setAllGains,
    setEqPreset,
    fadeTo,
    getOutputLatency,
    playbackRate,
    setPlaybackRate,
    prepareGhost,
    startGhostTail,
    disposeGhost,
    hydrateAudio,
  }
}
