import { app, dialog, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

type Notify = (message: string) => void

let notify: Notify = () => undefined
let getWindow: () => BrowserWindow | null = () => null
// true cuando el usuario pidio buscar a mano (se le informa aunque no haya nada).
let manualCheck = false

/**
 * Actualizaciones desde las releases de GitHub (config "publish" de
 * electron-builder). Descarga en segundo plano y pregunta antes de instalar.
 * Solo funciona en la app instalada: en desarrollo no hay app-update.yml.
 */
export function initUpdater(options: { notify: Notify; getWindow: () => BrowserWindow | null }): void {
  notify = options.notify
  getWindow = options.getWindow
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    notify(`Descargando version ${info.version}…`)
  })

  autoUpdater.on('update-not-available', () => {
    if (manualCheck) notify('Ya tienes la ultima version')
    manualCheck = false
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err)
    if (manualCheck) notify('No se pudo buscar actualizaciones')
    manualCheck = false
  })

  autoUpdater.on('update-downloaded', async (info) => {
    manualCheck = false
    const win = getWindow()
    const box = {
      type: 'info' as const,
      title: 'Actualizacion lista',
      message: `winMusic ${info.version} esta lista para instalar.`,
      detail: 'Se instalara al reiniciar. Si eliges "Mas tarde", se instalara al cerrar la app.',
      buttons: ['Reiniciar ahora', 'Mas tarde'],
      defaultId: 0,
      cancelId: 1,
    }
    const { response } = win ? await dialog.showMessageBox(win, box) : await dialog.showMessageBox(box)
    if (response === 0) autoUpdater.quitAndInstall()
  })

  void autoUpdater.checkForUpdates().catch(() => undefined)
}

/** Busqueda manual (menu de la bandeja). */
export function checkForUpdatesManually(): void {
  if (!app.isPackaged) {
    notify('Las actualizaciones solo funcionan en la app instalada')
    return
  }
  manualCheck = true
  notify('Buscando actualizaciones…')
  void autoUpdater.checkForUpdates().catch(() => undefined)
}
