import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { YtSearchResult } from '../main/youtube'
import type { MediaTags } from '../main/ffmpeg'
import type { LyricsQuery, LyricsResult } from '../main/lyrics'
import type { M3uEntry, M3uTrack } from '../main/m3u'
import type { SubtitleCue } from '../main/subtitles'

export type { YtSearchResult, MediaTags, LyricsResult, M3uEntry, M3uTrack, SubtitleCue }

/** Si un archivo local se reproduce tal cual o convertido por ffmpeg. */
export interface MediaProbe {
  nativePlayable: boolean
  duration: number | null
}

/** Lista guardada con nombre. */
export interface SavedList {
  id: string
  name: string
  tracks: unknown[]
}

export interface AudioSave {
  volume: number
  muted: boolean
  eqGains: number[]
  eqPreset: string
  playbackRate: number
}

/** Punto donde quedo la reproduccion, para seguir al volver a abrir. */
export interface ResumeSave {
  key: string
  position: number
}

export interface PlaylistSave {
  tracks: unknown[]
  currentIndex: number
  shuffle: boolean
  repeat: string
  lists: SavedList[]
  activeId: string | null
  resume?: ResumeSave | null
}

/** Comandos de las teclas multimedia enviados desde el main. */
export type MediaCommand = 'playpause' | 'next' | 'prev' | 'stop'

export interface MediaMeta {
  name: string
  ext: string
  kind: 'audio' | 'video'
  url: string
}

const api = {
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: (): Promise<void> => ipcRenderer.invoke('window:toggleMaximize'),
  close: (): Promise<void> => ipcRenderer.invoke('window:close'),
  openFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFiles'),
  openFolder: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFolder'),
  parsePath: (filePath: string): Promise<MediaMeta> =>
    ipcRenderer.invoke('path:parse', filePath),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  resolveDropped: (paths: string[]): Promise<string[]> =>
    ipcRenderer.invoke('resolve:dropped', paths),

  // --- Persistencia ---
  loadState: (): Promise<{
    playlist: PlaylistSave
    audio: AudioSave
  }> => ipcRenderer.invoke('state:load'),
  savePlaylist: (playlist: PlaylistSave): void =>
    ipcRenderer.send('state:savePlaylist', playlist),

  // --- Respaldo completo ---
  exportBackup: (): Promise<boolean> => ipcRenderer.invoke('backup:export'),
  importBackup: (): Promise<'imported' | 'canceled' | 'invalid'> =>
    ipcRenderer.invoke('backup:import'),

  // --- Listas .m3u ---
  exportPlaylist: (name: string, tracks: M3uTrack[]): Promise<boolean> =>
    ipcRenderer.invoke('playlist:export', name, tracks),
  importPlaylist: (): Promise<{ name: string; entries: M3uEntry[] } | null> =>
    ipcRenderer.invoke('playlist:import'),

  // --- Datos de la cancion y letras ---
  getTags: (filePath: string): Promise<MediaTags> => ipcRenderer.invoke('media:tags', filePath),
  probeMedia: (filePath: string): Promise<MediaProbe> => ipcRenderer.invoke('media:probe', filePath),

  // --- Subtitulos ---
  findSubtitles: (videoPath: string): Promise<SubtitleCue[] | null> =>
    ipcRenderer.invoke('subtitles:find', videoPath),
  openSubtitles: (): Promise<SubtitleCue[] | null> => ipcRenderer.invoke('subtitles:open'),

  // --- Idioma y archivos abiertos desde el Explorador ---
  setLanguage: (lang: 'es' | 'en'): void => ipcRenderer.send('app:setLanguage', lang),
  takeLaunchFiles: (): Promise<string[]> => ipcRenderer.invoke('app:takeLaunchFiles'),
  onOpenFiles: (cb: (paths: string[]) => void): (() => void) => {
    const handler = (_e: unknown, paths: string[]) => cb(paths)
    ipcRenderer.on('app:openFiles', handler)
    return () => ipcRenderer.removeListener('app:openFiles', handler)
  },
  saveResume: (resume: ResumeSave | null): void => ipcRenderer.send('state:saveResume', resume),
  getLyrics: (query: LyricsQuery): Promise<LyricsResult> =>
    ipcRenderer.invoke('lyrics:get', query),

  // --- Modo mini ---
  setMini: (mini: boolean): Promise<void> => ipcRenderer.invoke('window:setMini', mini),
  saveAudio: (audio: AudioSave): void => ipcRenderer.send('state:saveAudio', audio),

  // --- Presets propios del ecualizador ---
  eqGetCustomPresets: (): Promise<Record<string, number[]>> =>
    ipcRenderer.invoke('eq:getCustomPresets'),
  eqSaveCustomPreset: (name: string, gains: number[]): Promise<Record<string, number[]>> =>
    ipcRenderer.invoke('eq:saveCustomPreset', name, gains),
  eqDeleteCustomPreset: (name: string): Promise<Record<string, number[]>> =>
    ipcRenderer.invoke('eq:deleteCustomPreset', name),

  // --- Acerca de ---
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('app:checkUpdates'),
  onShowAbout: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('app:showAbout', handler)
    return () => ipcRenderer.removeListener('app:showAbout', handler)
  },

  // --- Avisos del main (p.ej. actualizaciones) ---
  onNotice: (cb: (message: string) => void): (() => void) => {
    const handler = (_e: unknown, message: string) => cb(message)
    ipcRenderer.on('app:notice', handler)
    return () => ipcRenderer.removeListener('app:notice', handler)
  },

  // --- Teclas multimedia ---
  onMediaCommand: (cb: (command: MediaCommand) => void): (() => void) => {
    const handler = (_e: unknown, command: MediaCommand) => cb(command)
    ipcRenderer.on('media:command', handler)
    return () => ipcRenderer.removeListener('media:command', handler)
  },

  // --- YouTube ---
  youtubeSearch: (query: string, page = 1): Promise<YtSearchResult[]> =>
    ipcRenderer.invoke('youtube:search', query, page),

  // --- Ventana de busqueda ---
  toggleSearchWindow: (): Promise<void> =>
    ipcRenderer.invoke('search:toggleWindow'),
  getWindowsOpenState: (): Promise<{ eq: boolean; search: boolean }> =>
    ipcRenderer.invoke('windows:getOpenState'),
  searchAdd: (result: YtSearchResult, asVideo: boolean): void =>
    ipcRenderer.send('search:add', { result, asVideo }),
  onSearchAddResult: (cb: (result: YtSearchResult, asVideo: boolean) => void): (() => void) => {
    const handler = (_e: unknown, p: { result: YtSearchResult; asVideo: boolean }) =>
      cb(p.result, !!p.asVideo)
    ipcRenderer.on('search:addResult', handler)
    return () => ipcRenderer.removeListener('search:addResult', handler)
  },
  onSearchWindowClosed: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('search:windowClosed', handler)
    return () => ipcRenderer.removeListener('search:windowClosed', handler)
  },
  onWindowsOpenState: (
    cb: (state: { eq: boolean; search: boolean }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, s: { eq: boolean; search: boolean }) => cb(s)
    ipcRenderer.on('windows:openState', handler)
    return () => ipcRenderer.removeListener('windows:openState', handler)
  },

  // --- Ecualizador (ventana aparte) ---
  toggleEqWindow: (): Promise<void> => ipcRenderer.invoke('eq:toggleWindow'),
  eqSetPreset: (preset: string, gains: number[]): void =>
    ipcRenderer.send('eq:setGains', { preset, gains }),
  eqSetBand: (index: number, gain: number): void =>
    ipcRenderer.send('eq:setBand', { index, gain }),
  eqPublishState: (state: { preset: string; gains: number[] }): void =>
    ipcRenderer.send('eq:publishState', state),
  eqRequestState: (): Promise<void> => ipcRenderer.invoke('eq:requestState'),

  // Listeners (devuelven funcion para desuscribir)
  onEqApplyGains: (
    cb: (preset: string, gains: number[]) => void,
  ): (() => void) => {
    const handler = (_e: unknown, p: { preset: string; gains: number[] }) =>
      cb(p.preset, p.gains)
    ipcRenderer.on('eq:applyGains', handler)
    return () => ipcRenderer.removeListener('eq:applyGains', handler)
  },
  onEqApplyBand: (cb: (index: number, gain: number) => void): (() => void) => {
    const handler = (_e: unknown, p: { index: number; gain: number }) =>
      cb(p.index, p.gain)
    ipcRenderer.on('eq:applyBand', handler)
    return () => ipcRenderer.removeListener('eq:applyBand', handler)
  },
  onEqState: (
    cb: (state: { preset: string; gains: number[] }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, state: { preset: string; gains: number[] }) =>
      cb(state)
    ipcRenderer.on('eq:state', handler)
    return () => ipcRenderer.removeListener('eq:state', handler)
  },
  onEqRequestState: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('eq:requestState', handler)
    return () => ipcRenderer.removeListener('eq:requestState', handler)
  },
  onEqWindowClosed: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('eq:windowClosed', handler)
    return () => ipcRenderer.removeListener('eq:windowClosed', handler)
  },
}

contextBridge.exposeInMainWorld('winmusic', api)

export type WinMusicApi = typeof api
