import { YoutubeSearch } from './components/YoutubeSearch'
import { TitleBar } from './components/TitleBar'
import { useRainbowAccent } from './hooks/useRainbowAccent'
import { useSharedTheme } from './hooks/useSharedTheme'
import { useT } from './i18n'

/**
 * Ventana independiente del buscador de YouTube. Delega el agregado a la
 * playlist en la ventana principal via IPC.
 */
export default function SearchWindow() {
  useRainbowAccent()
  useSharedTheme()
  const { t } = useT()

  return (
    <div className="searchwin">
      <TitleBar logo="YT" title={t('win.searchTitle')} canMaximize={false} />
      <YoutubeSearch onAdd={(r, asVideo) => window.winmusic.searchAdd(r, asVideo)} />
    </div>
  )
}
