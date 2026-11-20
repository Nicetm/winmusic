import { app, dialog, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { tr } from './i18n'

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
    notify(tr('upd.downloading', { v: info.version }))
  })

  autoUpdater.on('update-not-available', () => {
    if (manualCheck) notify(tr('upd.latest'))
    manualCheck = false
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err)
    if (manualCheck) notify(tr('upd.failed'))
    manualCheck = false
  })

  autoUpdater.on('update-downloaded', async (info) => {
    manualCheck = false
    const win = getWindow()
    const box = {
      type: 'info' as const,
      title: tr('upd.readyTitle'),
      message: tr('upd.readyMessage', { v: info.version }),
      detail: tr('upd.readyDetail'),
      buttons: [tr('upd.restart'), tr('upd.later')],
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
    notify(tr('upd.devOnly'))
    return
  }
  manualCheck = true
  notify(tr('upd.checking'))
  void autoUpdater.checkForUpdates().catch(() => undefined)
}
