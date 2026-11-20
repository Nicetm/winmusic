import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  globalShortcut,
  Tray,
  Menu,
} from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import {
  probeMedia,
  transcodeToStream,
  extractAudioFromUrl,
  readTags,
  extractCover,
  type ProbeResult,
} from './ffmpeg'
import { searchYoutube, resolveAudioUrl, prepareYtdlp } from './youtube'
import { fetchLyrics, type LyricsQuery } from './lyrics'
import { exportM3u, importM3u, type M3uTrack } from './m3u'
import { computeSnap, DOCK_GAP, type Rect } from './windows'
import { initUpdater, checkForUpdatesManually } from './updater'
import type { MediaCommand } from '../preload'
import {
  loadState,
  saveState,
  flushState,
  type PersistedState,
  type WindowBounds,
} from './store'

// En desarrollo se usa una carpeta de datos propia: si compartiera la de la
// app instalada, cada una sobreescribiria las listas de la otra. Tiene que ir
// antes de loadState(), que lee de userData.
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'winmusic-dev'))
}

// Una sola instancia: dos procesos guardando el mismo archivo se pisan entre
// si. La segunda instancia sale sin escribir nada (app.exit no dispara
// before-quit) y la primera pasa al frente.
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) app.exit(0)

const state: PersistedState = loadState()

function persistWindowBounds(): void {
  // Durante el cierre no tocamos el estado: ya lo congelamos en before-quit.
  if (quitting) return
  // Minimizadas, las ventanas pueden reportar posiciones fuera de pantalla.
  if ([win, eqWin, searchWin].some((w) => w && !w.isDestroyed() && w.isMinimized())) return
  if (win && !win.isDestroyed()) {
    // En modo mini se guarda el tamano normal, no la barra compacta.
    state.windows.main = miniRestore ?? win.getBounds()
  }
  const eqAlive = eqWin && !eqWin.isDestroyed()
  state.windows.eq = {
    ...(eqAlive ? eqWin!.getBounds() : (state.windows.eq ?? { x: 0, y: 0, width: EQ_WIDTH, height: EQ_HEIGHT })),
    open: openState.eq,
  }
  const searchAlive = searchWin && !searchWin.isDestroyed()
  state.windows.search = {
    ...(searchAlive ? searchWin!.getBounds() : (state.windows.search ?? { x: 0, y: 0, width: SEARCH_WIDTH, height: SEARCH_HEIGHT })),
    open: openState.search,
  }
  saveState(state)
}

const isDev = !!process.env.VITE_DEV_SERVER_URL

const MEDIA_SCHEME = 'wmedia'

const AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac']
const VIDEO_EXT = ['.mp4', '.webm', '.mkv', '.mov', '.avi']
const MEDIA_EXT = [...AUDIO_EXT, ...VIDEO_EXT]

let win: BrowserWindow | null = null
let eqWin: BrowserWindow | null = null
let searchWin: BrowserWindow | null = null

const EQ_WIDTH = 340
const EQ_HEIGHT = 200
const SEARCH_WIDTH = 380
const SEARCH_HEIGHT = 440

// Evita bucles de reposicionamiento cuando movemos ventanas por codigo.
let suppressMove = false
// Mientras la app se cierra, no actualizamos el estado de ventanas: lo
// congelamos tal como estaba para restaurarlo en el proximo arranque.
let quitting = false
// Bounds normales de la principal mientras esta en modo mini (null = normal).
let miniRestore: Rect | null = null
const MINI_HEIGHT = 118
let tray: Tray | null = null

/** Icono de la app: en dev en ./build, empaquetado en resources (extraResources). */
function appIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'build', 'icon.png')
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true },
  },
])

const MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
}

/** Decodifica una URL wmedia://host/<ruta> a una ruta absoluta del sistema. */
function mediaUrlToPath(url: string): string {
  const withoutScheme = url.slice(`${MEDIA_SCHEME}://`.length)
  const firstSlash = withoutScheme.indexOf('/')
  const encodedPath = firstSlash === -1 ? '' : withoutScheme.slice(firstSlash + 1)
  return path.normalize(decodeURIComponent(encodedPath))
}

/** Interpreta un header Range (bytes=start-end) sobre un tamano total. */
function parseRange(
  rangeHeader: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  let start = rawStart === '' ? 0 : Number(rawStart)
  let end = rawEnd === '' ? size - 1 : Number(rawEnd)
  if (rawStart === '' && rawEnd !== '') {
    // bytes=-N -> ultimos N bytes
    start = Math.max(0, size - Number(rawEnd))
    end = size - 1
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    return null
  }
  return { start, end: Math.min(end, size - 1) }
}

const probeCache = new Map<string, Promise<ProbeResult>>()

function getProbe(filePath: string): Promise<ProbeResult> {
  let cached = probeCache.get(filePath)
  if (!cached) {
    cached = probeMedia(filePath)
    probeCache.set(filePath, cached)
  }
  return cached
}

/** Sirve el archivo tal cual, con soporte de Range para seek. */
function serveDirect(filePath: string, size: number, rangeHeader: string | null): Response {
  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const range = parseRange(rangeHeader, size)

  if (range) {
    const { start, end } = range
    const stream = createReadStream(filePath, { start, end })
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      },
    })
  }

  const stream = createReadStream(filePath)
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
    },
  })
}

/** Sirve el archivo transcodificado a MP4 fragmentado por streaming (sin Range). */
function serveTranscoded(filePath: string, probe: ProbeResult): Response {
  const proc = transcodeToStream(filePath, probe)
  proc.stderr.on('data', () => {
    // ffmpeg escribe progreso en stderr; se ignora salvo depuracion.
  })
  const webStream = Readable.toWeb(proc.stdout) as ReadableStream
  // Si el consumidor cancela (cambio de pista), matamos ffmpeg.
  const body = new ReadableStream({
    start(controller) {
      const reader = webStream.getReader()
      const pump = (): void => {
        reader.read().then(
          ({ done, value }) => {
            if (done) {
              controller.close()
              return
            }
            controller.enqueue(value)
            pump()
          },
          (err) => controller.error(err),
        )
      }
      pump()
    },
    cancel() {
      proc.kill('SIGKILL')
    },
  })

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
    },
  })
}

/**
 * Sirve el audio de un video de YouTube a traves de nuestro origen (wmedia).
 * yt-dlp resuelve la URL del stream; ffmpeg descarta el video (-vn) y entrega
 * solo audio AAC. Esto evita dos problemas: el CORS de googlevideo (que taintea
 * Web Audio) y el "Unsupported pixel format" cuando el stream trae video.
 */
async function serveYoutube(videoId: string, startSeconds: number): Promise<Response> {
  let streamUrl: string
  try {
    streamUrl = await resolveAudioUrl(videoId)
  } catch {
    return new Response('No se pudo resolver el audio', { status: 502 })
  }

  const proc = extractAudioFromUrl(streamUrl, startSeconds)
  proc.stderr.on('data', () => {
    // ffmpeg escribe progreso en stderr; se ignora salvo depuracion.
  })

  let closed = false
  const webStream = Readable.toWeb(proc.stdout) as ReadableStream
  const reader = webStream.getReader()
  const body = new ReadableStream({
    start(controller) {
      const pump = (): void => {
        reader.read().then(
          ({ done, value }) => {
            if (closed) return
            if (done) {
              closed = true
              controller.close()
              return
            }
            controller.enqueue(value)
            pump()
          },
          () => {
            if (!closed) {
              closed = true
              try {
                controller.close()
              } catch {
                // El controlador ya pudo cerrarse por cancelacion.
              }
            }
          },
        )
      }
      pump()
    },
    cancel() {
      closed = true
      void reader.cancel().catch(() => undefined)
      proc.kill('SIGKILL')
    },
  })

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg' },
  })
}

function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    // Stream remoto de YouTube: wmedia://youtube/<videoId>?t=<segundos>
    const ytMatch = /^wmedia:\/\/youtube\/([A-Za-z0-9_-]{6,15})/.exec(request.url)
    if (ytMatch) {
      const t = Number(new URL(request.url).searchParams.get('t') ?? 0)
      return serveYoutube(ytMatch[1], Number.isFinite(t) && t > 0 ? t : 0)
    }

    // Caratula incrustada de un archivo local: wmedia://cover/<ruta>
    if (request.url.startsWith(`${MEDIA_SCHEME}://cover/`)) {
      const cover = await extractCover(mediaUrlToPath(request.url))
      if (!cover) return new Response('Sin caratula', { status: 404 })
      return new Response(new Uint8Array(cover), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' },
      })
    }

    const filePath = mediaUrlToPath(request.url)
    let stat
    try {
      stat = await fs.stat(filePath)
    } catch {
      return new Response('Not found', { status: 404 })
    }
    if (!stat.isFile()) return new Response('Not found', { status: 404 })

    try {
      const probe = await getProbe(filePath)
      if (!probe.nativePlayable) {
        return serveTranscoded(filePath, probe)
      }
    } catch {
      // Si ffprobe falla, intentamos servir directo igualmente.
    }

    return serveDirect(filePath, stat.size, request.headers.get('range'))
  })
}

function createWindow(): void {
  const saved = state.windows.main
  win = new BrowserWindow({
    width: saved?.width ?? 420,
    height: saved?.height ?? 600,
    x: saved?.x,
    y: saved?.y,
    minWidth: 360,
    minHeight: 220,
    frame: false,
    resizable: true,
    backgroundColor: '#1a1a1a',
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'))
  }

  win.once('ready-to-show', () => {
    if (win) mainPrev = win.getBounds()
  })
  win.on('move', () => {
    onMainBoundsChange()
    persistWindowBounds()
  })
  win.on('resize', () => {
    onMainBoundsChange()
    persistWindowBounds()
  })
  linkMinimize(win)
  // 'close' ocurre ANTES de destruir las ventanas: capturamos el estado con
  // las secundarias aun abiertas y lo congelamos para el proximo arranque.
  win.on('close', () => {
    persistWindowBounds()
    quitting = true
    flushState()
  })
  win.on('closed', () => {
    win = null
    if (eqWin && !eqWin.isDestroyed()) eqWin.close()
    if (searchWin && !searchWin.isDestroyed()) searchWin.close()
  })

  // Reabre las ventanas secundarias que estaban abiertas en la sesion previa.
  win.webContents.once('did-finish-load', () => {
    if (state.windows.eq?.open) createEqWindow()
    if (state.windows.search?.open) createSearchWindow()
    // Informa a la principal que botones marcar como activos tras restaurar.
    win?.webContents.send('windows:openState', {
      eq: openState.eq,
      search: openState.search,
    })
  })
}

function loadRoute(target: BrowserWindow, hash: string): void {
  if (process.env.VITE_DEV_SERVER_URL) {
    target.loadURL(`${process.env.VITE_DEV_SERVER_URL}#${hash}`)
  } else {
    target.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'), {
      hash,
    })
  }
}

type Role = 'eq' | 'search'

interface SecondaryConfig {
  role: Role
  get: () => BrowserWindow | null
  set: (w: BrowserWindow | null) => void
  width: number
  height: number
  minWidth: number
  minHeight: number
  hash: string
  onClosed: () => void
}

/** Ventanas secundarias acopladas al grupo del reproductor. */
const dockedState: Record<Role, boolean> = { eq: false, search: false }

/**
 * Intencion del usuario de tener abierta cada secundaria. Solo cambia al
 * abrir/cerrar manualmente, no por el ciclo de vida al salir de la app; asi
 * la restauracion no depende del orden de los eventos de cierre.
 */
const openState: Record<Role, boolean> = { eq: false, search: false }

function secondaryWindows(): BrowserWindow[] {
  return [eqWin, searchWin].filter(
    (w): w is BrowserWindow => !!w && !w.isDestroyed(),
  )
}

function dockedWindows(): BrowserWindow[] {
  const result: BrowserWindow[] = []
  if (eqWin && !eqWin.isDestroyed() && dockedState.eq) result.push(eqWin)
  if (searchWin && !searchWin.isDestroyed() && dockedState.search) result.push(searchWin)
  return result
}

function roleOf(w: BrowserWindow): Role | null {
  if (w === eqWin) return 'eq'
  if (w === searchWin) return 'search'
  return null
}

// Bounds previos de la principal para calcular el desplazamiento de cada borde.
let mainPrev: Rect | null = null

/** Coloca una secundaria apilada a la derecha, debajo de las ya abiertas. */
function initialPlacement(): { x: number; y: number } {
  const m = win?.getBounds()
  if (!m) return { x: 100, y: 100 }
  let y = m.y
  for (const w of secondaryWindows()) {
    const b = w.getBounds()
    if (Math.abs(b.x - (m.x + m.width + DOCK_GAP)) <= 6) {
      y = Math.max(y, b.y + b.height + DOCK_GAP)
    }
  }
  return { x: m.x + m.width + DOCK_GAP, y }
}

function createSecondary(cfg: SecondaryConfig): void {
  const existing = cfg.get()
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }
  // Usa los bounds guardados si existen; si no, los apila junto a la principal.
  const savedBounds = state.windows[cfg.role] as (WindowBounds & { open: boolean }) | undefined
  const pos = savedBounds ? { x: savedBounds.x, y: savedBounds.y } : initialPlacement()
  const w = new BrowserWindow({
    width: savedBounds?.width ?? cfg.width,
    height: savedBounds?.height ?? cfg.height,
    minWidth: cfg.minWidth,
    minHeight: cfg.minHeight,
    x: pos.x,
    y: pos.y,
    frame: false,
    resizable: true,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  cfg.set(w)
  loadRoute(w, cfg.hash)
  // Al abrir junto a la principal queda acoplada y marcada como abierta.
  dockedState[cfg.role] = true
  openState[cfg.role] = true

  // Mientras arrastro una secundaria, se separa del grupo.
  w.on('move', () => {
    // Minimizar/restaurar tambien emite 'move': no cuenta como arrastre.
    if (suppressMove || syncingMinimize || w.isMinimized()) return
    // Si sigue exactamente pegada (p.ej. 'move' al restaurar), no se separa.
    if (!isTouchingGroup(w)) dockedState[cfg.role] = false
    persistWindowBounds()
  })
  w.on('resize', () => persistWindowBounds())
  linkMinimize(w)
  // Al soltar, intento re-acoplar si quedo junto a un borde del grupo.
  w.on('moved', () => {
    if (syncingMinimize || w.isMinimized()) return
    onSecondaryDropped(w)
    persistWindowBounds()
  })
  w.on('closed', () => {
    cfg.set(null)
    dockedState[cfg.role] = false
    // Solo un cierre iniciado por el usuario marca la intencion como cerrada;
    // el cierre al salir de la app conserva openState para la restauracion.
    if (!quitting) {
      openState[cfg.role] = false
      cfg.onClosed()
      persistWindowBounds()
    }
  })
}

const eqConfig: SecondaryConfig = {
  role: 'eq',
  get: () => eqWin,
  set: (w) => (eqWin = w),
  width: EQ_WIDTH,
  height: EQ_HEIGHT,
  minWidth: 300,
  minHeight: 170,
  hash: 'eq',
  onClosed: () => win?.webContents.send('eq:windowClosed'),
}

const searchConfig: SecondaryConfig = {
  role: 'search',
  get: () => searchWin,
  set: (w) => (searchWin = w),
  width: SEARCH_WIDTH,
  height: SEARCH_HEIGHT,
  minWidth: 320,
  minHeight: 260,
  hash: 'search',
  onClosed: () => win?.webContents.send('search:windowClosed'),
}

function createEqWindow(): void {
  createSecondary(eqConfig)
}

function createSearchWindow(): void {
  createSecondary(searchConfig)
}

/** Rectangulos de la principal + secundarias acopladas (el "grupo"). */
function groupRects(exclude?: BrowserWindow): Rect[] {
  const rects: Rect[] = []
  if (win && !win.isDestroyed() && win !== exclude) rects.push(win.getBounds())
  for (const w of dockedWindows()) if (w !== exclude) rects.push(w.getBounds())
  return rects
}

/**
 * El reproductor manda: al moverlo o redimensionarlo, cada secundaria acoplada
 * sigue el borde al que esta pegada. Redimensionar desde la izquierda cambia
 * la x de la principal, pero su borde derecho queda fijo: las pegadas a la
 * derecha no deben moverse (antes se desplazaban y quedaban debajo).
 */
function onMainBoundsChange(): void {
  // Al minimizar Windows puede reportar posiciones fuera de pantalla: no se
  // arrastran las acopladas en ese estado.
  if (suppressMove || !win || win.isDestroyed() || win.isMinimized()) return
  const cur = win.getBounds()
  const prev = mainPrev
  mainPrev = cur
  if (!prev) return

  // Tolerancia para reconocer un borde acoplado (incluye la separacion).
  const EDGE = DOCK_GAP + 4
  const leftD = cur.x - prev.x
  const rightD = cur.x + cur.width - (prev.x + prev.width)
  const topD = cur.y - prev.y
  const bottomD = cur.y + cur.height - (prev.y + prev.height)
  if (leftD === 0 && rightD === 0 && topD === 0 && bottomD === 0) return

  suppressMove = true
  for (const w of dockedWindows()) {
    const b = w.getBounds()
    // Horizontal: pegada al borde derecho -> sigue el derecho; pegada al
    // izquierdo -> sigue el izquierdo; si esta arriba/abajo, sigue el izquierdo.
    let dx = leftD
    if (Math.abs(b.x - (prev.x + prev.width)) <= EDGE) dx = rightD
    else if (Math.abs(b.x + b.width - prev.x) <= EDGE) dx = leftD

    // Vertical: pegada debajo -> sigue el borde inferior; encima -> superior;
    // si esta a un lado, sigue el superior.
    let dy = topD
    if (Math.abs(b.y - (prev.y + prev.height)) <= EDGE) dy = bottomD
    else if (Math.abs(b.y + b.height - prev.y) <= EDGE) dy = topD

    if (dx !== 0 || dy !== 0) {
      w.setBounds({ x: b.x + dx, y: b.y + dy, width: b.width, height: b.height })
    }
  }
  suppressMove = false
}

/** true si la ventana esta exactamente acoplada a un borde del grupo. */
function isTouchingGroup(w: BrowserWindow): boolean {
  const rect = w.getBounds()
  return groupRects(w).some((other) => {
    const snap = computeSnap(rect, other)
    return !!snap && snap.dx === 0 && snap.dy === 0
  })
}

/**
 * Al soltar una secundaria: si quedo junto a un borde del grupo del
 * reproductor, se pega (docked=true). Si no, queda libre donde se solto.
 */
function onSecondaryDropped(moved: BrowserWindow): void {
  if (suppressMove || moved.isDestroyed()) return
  const role = roleOf(moved)
  if (!role) return
  const movingRect = moved.getBounds()

  let best: { dx: number; dy: number; dist: number } | null = null
  for (const rect of groupRects(moved)) {
    const snap = computeSnap(movingRect, rect)
    if (!snap) continue
    const dist = Math.abs(snap.dx) + Math.abs(snap.dy)
    if (!best || dist < best.dist) best = { ...snap, dist }
  }

  if (best) {
    suppressMove = true
    moved.setBounds({
      x: movingRect.x + best.dx,
      y: movingRect.y + best.dy,
      width: movingRect.width,
      height: movingRect.height,
    })
    suppressMove = false
    dockedState[role] = true
  } else {
    dockedState[role] = false
  }
}

function isMediaFile(filePath: string): boolean {
  return MEDIA_EXT.includes(path.extname(filePath).toLowerCase())
}

async function collectMediaFromDir(dir: string): Promise<string[]> {
  const result: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await collectMediaFromDir(full)))
    } else if (entry.isFile() && isMediaFile(full)) {
      result.push(full)
    }
  }
  return result
}

function registerIpc(): void {
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle('window:toggleMaximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })

  ipcMain.handle('eq:toggleWindow', () => {
    if (eqWin && !eqWin.isDestroyed()) {
      eqWin.close()
    } else {
      createEqWindow()
    }
  })

  ipcMain.handle('search:toggleWindow', () => {
    if (searchWin && !searchWin.isDestroyed()) {
      searchWin.close()
    } else {
      createSearchWindow()
    }
  })

  ipcMain.handle('windows:getOpenState', () => ({
    eq: openState.eq,
    search: openState.search,
  }))

  // La ventana de busqueda pide reproducir/agregar -> la principal maneja la playlist.
  ipcMain.on('search:play', (_e, result) => {
    win?.webContents.send('search:playResult', result)
  })
  ipcMain.on('search:add', (_e, result) => {
    win?.webContents.send('search:addResult', result)
  })

  // Puente de ganancias: la ventana EQ emite -> la principal aplica al grafo.
  ipcMain.on('eq:setGains', (_e, payload: { preset: string; gains: number[] }) => {
    win?.webContents.send('eq:applyGains', payload)
  })
  ipcMain.on('eq:setBand', (_e, payload: { index: number; gain: number }) => {
    win?.webContents.send('eq:applyBand', payload)
  })
  // La principal publica su estado actual del EQ para que la ventana se sincronice.
  ipcMain.on('eq:publishState', (_e, state: { preset: string; gains: number[] }) => {
    eqWin?.webContents.send('eq:state', state)
  })
  ipcMain.handle('eq:requestState', () => {
    win?.webContents.send('eq:requestState')
  })

  ipcMain.handle('dialog:openFiles', async () => {
    if (!win) return []
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Agregar archivos',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Multimedia', extensions: MEDIA_EXT.map((e) => e.slice(1)) },
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    })
    if (canceled) return []
    return filePaths.filter(isMediaFile)
  })

  ipcMain.handle('dialog:openFolder', async () => {
    if (!win) return []
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Agregar carpeta',
      properties: ['openDirectory'],
    })
    if (canceled || filePaths.length === 0) return []
    return collectMediaFromDir(filePaths[0])
  })

  ipcMain.handle('youtube:search', async (_e, query: string, page: number) => {
    return searchYoutube(query, page)
  })

  // --- Datos de la cancion y letras ---
  ipcMain.handle('media:tags', (_e, filePath: string) => readTags(filePath))
  ipcMain.handle('lyrics:get', (_e, query: LyricsQuery) => fetchLyrics(query))

  // --- Listas .m3u ---
  ipcMain.handle('playlist:export', async (_e, name: string, tracks: M3uTrack[]) => {
    if (!win) return false
    const safeName = name.replace(/[\\/:*?"<>|]/g, '_') || 'lista'
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Exportar lista',
      defaultPath: `${safeName}.m3u8`,
      filters: [{ name: 'Lista M3U', extensions: ['m3u8', 'm3u'] }],
    })
    if (canceled || !filePath) return false
    await exportM3u(filePath, tracks)
    return true
  })
  ipcMain.handle('playlist:import', async () => {
    if (!win) return null
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Importar lista',
      properties: ['openFile'],
      filters: [{ name: 'Lista M3U', extensions: ['m3u8', 'm3u'] }],
    })
    if (canceled || filePaths.length === 0) return null
    const filePath = filePaths[0]
    return {
      name: path.basename(filePath, path.extname(filePath)),
      entries: await importM3u(filePath, isMediaFile),
    }
  })

  // --- Modo mini: barra compacta siempre visible ---
  ipcMain.handle('window:setMini', (_e, mini: boolean) => {
    if (!win || win.isDestroyed()) return
    if (mini && !miniRestore) {
      if (win.isMaximized()) win.unmaximize()
      miniRestore = win.getBounds()
      win.setMinimumSize(360, MINI_HEIGHT)
      win.setBounds({ ...miniRestore, height: MINI_HEIGHT })
      win.setAlwaysOnTop(true, 'floating')
    } else if (!mini && miniRestore) {
      const restore = miniRestore
      miniRestore = null
      win.setAlwaysOnTop(false)
      win.setMinimumSize(360, 220)
      win.setBounds({ ...restore, x: win.getBounds().x, y: win.getBounds().y })
    }
    persistWindowBounds()
  })

  // --- Persistencia de estado del renderer ---
  ipcMain.handle('state:load', () => ({
    playlist: state.playlist,
    audio: state.audio,
  }))
  // Se combina con lo guardado en vez de reemplazar: si llega un dato sin
  // algun campo (p.ej. sin `lists`), no se pierde el valor anterior.
  ipcMain.on('state:savePlaylist', (_e, playlist: Partial<PersistedState['playlist']>) => {
    state.playlist = { ...state.playlist, ...playlist }
    saveState(state)
  })
  ipcMain.on('state:saveAudio', (_e, audio: Partial<PersistedState['audio']>) => {
    state.audio = { ...state.audio, ...audio }
    saveState(state)
  })

  ipcMain.handle('resolve:dropped', async (_e, paths: string[]) => {
    const resolved: string[] = []
    for (const p of paths) {
      try {
        const stat = await fs.stat(p)
        if (stat.isDirectory()) {
          resolved.push(...(await collectMediaFromDir(p)))
        } else if (stat.isFile() && isMediaFile(p)) {
          resolved.push(p)
        }
      } catch {
        // Ignora rutas inaccesibles
      }
    }
    return resolved
  })

  ipcMain.handle('path:parse', (_e, filePath: string) => {
    const ext = path.extname(filePath).toLowerCase()
    const normalized = filePath.replace(/\\/g, '/')
    const encoded = normalized.split('/').map(encodeURIComponent).join('/')
    return {
      name: path.basename(filePath, path.extname(filePath)),
      ext,
      kind: VIDEO_EXT.includes(ext) ? 'video' : 'audio',
      url: `${MEDIA_SCHEME}://local/${encoded}`,
    }
  })
}

function sendMediaCommand(command: MediaCommand): void {
  win?.webContents.send('media:command', command)
}

// Evita que minimizar/restaurar las demas ventanas vuelva a disparar sus
// propios eventos en cadena.
let syncingMinimize = false

/**
 * Minimizar cualquier ventana minimiza todas; restaurar cualquiera (desde la
 * barra de tareas) restaura todas, para que se comporten como una sola app.
 */
function linkMinimize(w: BrowserWindow): void {
  const others = () =>
    [win, eqWin, searchWin].filter(
      (o): o is BrowserWindow => !!o && o !== w && !o.isDestroyed(),
    )
  w.on('minimize', () => {
    if (syncingMinimize) return
    syncingMinimize = true
    for (const o of others()) if (o.isVisible() && !o.isMinimized()) o.minimize()
    syncingMinimize = false
  })
  w.on('restore', () => {
    if (syncingMinimize) return
    syncingMinimize = true
    for (const o of others()) if (o.isMinimized()) o.restore()
    syncingMinimize = false
    w.focus()
  })
}

/** Oculta o muestra la principal junto con sus ventanas secundarias. */
function toggleAllWindows(): void {
  if (!win || win.isDestroyed()) return
  const windows = [win, eqWin, searchWin].filter(
    (w): w is BrowserWindow => !!w && !w.isDestroyed(),
  )
  if (win.isVisible() && !win.isMinimized()) {
    windows.forEach((w) => w.hide())
  } else {
    windows.forEach((w) => w.show())
    if (win.isMinimized()) win.restore()
    win.focus()
  }
}

/** Icono junto al reloj: clic para ocultar/mostrar, menu con los controles. */
function createTray(): void {
  tray = new Tray(appIconPath())
  tray.setToolTip('winMusic')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mostrar / ocultar', click: toggleAllWindows },
      { type: 'separator' },
      { label: 'Reproducir / pausa', click: () => sendMediaCommand('playpause') },
      { label: 'Siguiente', click: () => sendMediaCommand('next') },
      { label: 'Anterior', click: () => sendMediaCommand('prev') },
      { label: 'Detener', click: () => sendMediaCommand('stop') },
      { type: 'separator' },
      { label: 'Buscar actualizaciones', click: checkForUpdatesManually },
      { label: 'Salir', click: () => app.quit() },
    ]),
  )
  tray.on('click', toggleAllWindows)
}

/** Teclas multimedia del teclado: funcionan aunque la app no tenga el foco. */
function registerMediaKeys(): void {
  const keys: Array<[string, MediaCommand]> = [
    ['MediaPlayPause', 'playpause'],
    ['MediaNextTrack', 'next'],
    ['MediaPreviousTrack', 'prev'],
    ['MediaStop', 'stop'],
  ]
  for (const [accelerator, command] of keys) {
    const ok = globalShortcut.register(accelerator, () => sendMediaCommand(command))
    // Otra aplicacion puede tener la tecla tomada; no es un error de la app.
    if (!ok) console.warn(`[winmusic] tecla ${accelerator} ocupada por otra aplicacion`)
  }
}

// Si se intenta abrir otra instancia, se muestra la que ya estaba abierta.
app.on('second-instance', () => {
  if (!win || win.isDestroyed()) return
  for (const w of [win, eqWin, searchWin]) if (w && !w.isDestroyed()) w.show()
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.whenReady().then(() => {
  registerMediaProtocol()
  registerIpc()
  createWindow()
  createTray()
  registerMediaKeys()
  prepareYtdlp()
  initUpdater({
    notify: (message) => win?.webContents.send('app:notice', message),
    getWindow: () => win,
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('before-quit', () => {
  // Captura el estado con las ventanas aun vivas, luego lo congela para que
  // los eventos 'closed' del cierre no lo sobreescriban con open: false.
  persistWindowBounds()
  quitting = true
  flushState()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Las teclas multimedia las maneja globalShortcut; se desactiva el manejo
// propio de Chromium para que no actue tambien sobre el <video> (doble accion).
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling')

// Evita warnings de GPU en algunos entornos de desarrollo
if (isDev) {
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
}
