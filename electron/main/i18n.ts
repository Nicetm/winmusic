/** Textos del proceso principal (bandeja, dialogos nativos, actualizaciones). */
export type Lang = 'es' | 'en'

const es = {
  'tray.toggle': 'Mostrar / ocultar',
  'tray.playPause': 'Reproducir / pausa',
  'tray.next': 'Siguiente',
  'tray.prev': 'Anterior',
  'tray.stop': 'Detener',
  'tray.checkUpdates': 'Buscar actualizaciones',
  'tray.about': 'Acerca de winMusic',
  'tray.quit': 'Salir',
  'dlg.addFiles': 'Agregar archivos',
  'dlg.addFolder': 'Agregar carpeta',
  'dlg.media': 'Multimedia',
  'dlg.allFiles': 'Todos los archivos',
  'dlg.exportBackup': 'Exportar respaldo',
  'dlg.importBackup': 'Importar respaldo',
  'dlg.backupFilter': 'Respaldo de winMusic',
  'dlg.backupFileName': 'winmusic-respaldo',
  'dlg.importMessage': 'Se reemplazarán todas tus listas, el ecualizador y el volumen.',
  'dlg.importDetail': 'El respaldo tiene {n} lista(s). Esta acción no se puede deshacer.',
  'dlg.import': 'Importar',
  'dlg.cancel': 'Cancelar',
  'dlg.exportList': 'Exportar lista',
  'dlg.importList': 'Importar lista',
  'dlg.listFilter': 'Lista M3U',
  'dlg.listDefaultName': 'lista',
  'dlg.subtitles': 'Cargar subtítulos',
  'dlg.subtitlesFilter': 'Subtítulos',
  'upd.downloading': 'Descargando versión {v}…',
  'upd.latest': 'Ya tienes la última versión',
  'upd.failed': 'No se pudo buscar actualizaciones',
  'upd.readyTitle': 'Actualización lista',
  'upd.readyMessage': 'winMusic {v} está lista para instalar.',
  'upd.readyDetail': 'Se instalará al reiniciar. Si eliges "Más tarde", se instalará al cerrar la app.',
  'upd.restart': 'Reiniciar ahora',
  'upd.later': 'Más tarde',
  'upd.devOnly': 'Las actualizaciones solo funcionan en la app instalada',
  'upd.checking': 'Buscando actualizaciones…',
} as const

type MainKey = keyof typeof es

const en: Record<MainKey, string> = {
  'tray.toggle': 'Show / hide',
  'tray.playPause': 'Play / pause',
  'tray.next': 'Next',
  'tray.prev': 'Previous',
  'tray.stop': 'Stop',
  'tray.checkUpdates': 'Check for updates',
  'tray.about': 'About winMusic',
  'tray.quit': 'Quit',
  'dlg.addFiles': 'Add files',
  'dlg.addFolder': 'Add folder',
  'dlg.media': 'Media',
  'dlg.allFiles': 'All files',
  'dlg.exportBackup': 'Export backup',
  'dlg.importBackup': 'Import backup',
  'dlg.backupFilter': 'winMusic backup',
  'dlg.backupFileName': 'winmusic-backup',
  'dlg.importMessage': 'All your playlists, the equalizer and the volume will be replaced.',
  'dlg.importDetail': 'The backup has {n} playlist(s). This cannot be undone.',
  'dlg.import': 'Import',
  'dlg.cancel': 'Cancel',
  'dlg.exportList': 'Export playlist',
  'dlg.importList': 'Import playlist',
  'dlg.listFilter': 'M3U playlist',
  'dlg.listDefaultName': 'playlist',
  'dlg.subtitles': 'Load subtitles',
  'dlg.subtitlesFilter': 'Subtitles',
  'upd.downloading': 'Downloading version {v}…',
  'upd.latest': 'You already have the latest version',
  'upd.failed': 'Could not check for updates',
  'upd.readyTitle': 'Update ready',
  'upd.readyMessage': 'winMusic {v} is ready to install.',
  'upd.readyDetail': 'It will be installed on restart. If you choose "Later", it will be installed when you close the app.',
  'upd.restart': 'Restart now',
  'upd.later': 'Later',
  'upd.devOnly': 'Updates only work in the installed app',
  'upd.checking': 'Checking for updates…',
}

const DICTS: Record<Lang, Record<MainKey, string>> = { es, en }

let current: Lang = 'es'

export function setMainLang(lang: Lang): void {
  current = lang
}

/** Traduce una clave; `{nombre}` se reemplaza con `vars.nombre`. */
export function tr(key: MainKey, vars?: Record<string, string | number>): string {
  const text = DICTS[current][key]
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}
