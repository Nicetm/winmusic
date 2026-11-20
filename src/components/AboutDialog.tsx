import { useEffect, useState } from 'react'
import logo from '../../build/icon.png'

interface Props {
  version: string
  onClose: () => void
}

const REPO = 'https://github.com/Nicetm/winmusic'

type Tab = 'about' | 'help' | 'license'

const SHORTCUTS: Array<[string, string]> = [
  ['Espacio', 'Reproducir / pausa'],
  ['← / →', 'Retroceder / adelantar 5 s'],
  ['↑ / ↓', 'Subir / bajar volumen'],
  ['Teclas multimedia', 'Play, siguiente, anterior y stop (aunque la app no tenga el foco)'],
]

const TIPS = [
  'Arrastra archivos o carpetas a la ventana para agregarlos a la lista.',
  'Doble clic en una canción para reproducirla; clic derecho para moverla, copiarla a otra lista o quitarla.',
  'Clic sobre el gráfico para cambiar la forma del visualizador.',
  'El ecualizador y el buscador se pegan al reproductor y se mueven con él; arrástralos para separarlos.',
  'En la letra, usa −0,5 s / +0,5 s si va adelantada o atrasada.',
  'Botón ⋯ de la lista: listas con nombre, ordenar, importar/exportar .m3u y respaldo completo.',
]

const COMPONENTS: Array<{ name: string; license: string; url: string }> = [
  { name: 'Electron', license: 'MIT', url: 'https://github.com/electron/electron/blob/main/LICENSE' },
  { name: 'React', license: 'MIT', url: 'https://github.com/facebook/react/blob/main/LICENSE' },
  { name: 'FFmpeg (ffmpeg-static / ffprobe-static)', license: 'GPL v3', url: 'https://ffmpeg.org/legal.html' },
  { name: 'yt-dlp', license: 'Unlicense', url: 'https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE' },
  { name: 'LRCLIB (servicio de letras)', license: 'Términos del servicio', url: 'https://lrclib.net' },
]

/** Ventana "Acerca de": quienes somos, ayuda, licencia y privacidad. */
export function AboutDialog({ version, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('about')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const open = (url: string) => void window.winmusic.openExternal(url)
  const link = (label: string, url: string) => (
    <button className="about__link" onClick={() => open(url)}>
      {label}
    </button>
  )

  return (
    <div className="dialog" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog__box about" role="dialog" aria-label="Acerca de winMusic">
        <div className="about__header">
          <img className="about__logo" src={logo} alt="" />
          <div>
            <div className="about__name">winMusic</div>
            <div className="about__version">Versión {version}</div>
          </div>
        </div>

        <div className="about__tabs" role="tablist">
          {(
            [
              ['about', 'Acerca de'],
              ['help', 'Ayuda'],
              ['license', 'Licencia'],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`about__tab${tab === id ? ' is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="about__body">
          {tab === 'about' && (
            <>
              <p>
                Reproductor de audio y video para Windows, de código abierto. Reproduce archivos
                locales y YouTube, con listas, ecualizador, visualizador y letras sincronizadas.
              </p>
              <p>
                Hecho por <strong>@softkey</strong> · 2027
              </p>
              <ul className="about__list">
                <li>{link('Sitio y código fuente', REPO)}</li>
                <li>{link('Descargas y novedades', `${REPO}/releases`)}</li>
                <li>{link('Reportar un problema', `${REPO}/issues`)}</li>
              </ul>
              <button className="dialog__btn" onClick={() => void window.winmusic.checkForUpdates()}>
                Buscar actualizaciones
              </button>
            </>
          )}

          {tab === 'help' && (
            <>
              <h4 className="about__title">Atajos de teclado</h4>
              <table className="about__table">
                <tbody>
                  {SHORTCUTS.map(([key, action]) => (
                    <tr key={key}>
                      <td>
                        <kbd>{key}</kbd>
                      </td>
                      <td>{action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h4 className="about__title">Consejos</h4>
              <ul className="about__list about__list--dots">
                {TIPS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}

          {tab === 'license' && (
            <>
              <p>
                winMusic se distribuye bajo la licencia <strong>MIT</strong>. Copyright © 2026 Pablo
                Santibañez (softkey). {link('Ver licencia', `${REPO}/blob/main/LICENSE`)}
              </p>
              <h4 className="about__title">Componentes de terceros</h4>
              <ul className="about__list">
                {COMPONENTS.map((c) => (
                  <li key={c.name}>
                    {c.name} — {link(c.license, c.url)}
                  </li>
                ))}
              </ul>
              <h4 className="about__title">Privacidad</h4>
              <p>
                Las listas y la configuración se guardan solo en este equipo. La app se conecta a
                internet para buscar actualizaciones al iniciar y, cuando la usas, para buscar y
                reproducir YouTube y obtener letras. {link('Política de privacidad', `${REPO}#privacy-policy`)}
              </p>
              <p className="about__note">
                Reproducir contenido de YouTube fuera de su reproductor oficial va en contra de los
                Términos de Servicio de YouTube.
              </p>
            </>
          )}
        </div>

        <div className="dialog__actions">
          <button className="dialog__btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
