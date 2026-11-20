import { useEffect, useState } from 'react'
import logo from '../../build/icon.png'
import { setLang, useT, type Lang, type MessageKey } from '../i18n'

interface Props {
  version: string
  onClose: () => void
}

const REPO = 'https://github.com/Nicetm/winmusic'

type Tab = 'about' | 'help' | 'license'

const TABS: Array<[Tab, MessageKey]> = [
  ['about', 'about.tab.about'],
  ['help', 'about.tab.help'],
  ['license', 'about.tab.license'],
]

/** Texto fijo (nombres, simbolos) o clave traducible. */
type Label = { text: string } | { key: MessageKey }

/** Tecla y accion de cada atajo. */
const SHORTCUTS: Array<[Label, MessageKey]> = [
  [{ key: 'about.key.space' }, 'about.sc.space'],
  [{ text: '← / →' }, 'about.sc.arrowsLR'],
  [{ text: '↑ / ↓' }, 'about.sc.arrowsUD'],
  [{ key: 'about.key.select' }, 'about.sc.select'],
  [{ key: 'about.key.delete' }, 'about.sc.delete'],
  [{ key: 'about.key.media' }, 'about.sc.media'],
]

const TIPS: MessageKey[] = [
  'about.tip.drop',
  'about.tip.list',
  'about.tip.explorer',
  'about.tip.visualizer',
  'about.tip.dock',
  'about.tip.lyrics',
  'about.tip.more',
]

const COMPONENTS: Array<{ name: Label; license: Label; url: string }> = [
  { name: { text: 'Electron' }, license: { text: 'MIT' }, url: 'https://github.com/electron/electron/blob/main/LICENSE' },
  { name: { text: 'React' }, license: { text: 'MIT' }, url: 'https://github.com/facebook/react/blob/main/LICENSE' },
  {
    name: { text: 'FFmpeg (ffmpeg-static / ffprobe-static)' },
    license: { text: 'GPL v3' },
    url: 'https://ffmpeg.org/legal.html',
  },
  { name: { text: 'yt-dlp' }, license: { text: 'Unlicense' }, url: 'https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE' },
  { name: { key: 'about.lrclibName' }, license: { key: 'about.lrclibTerms' }, url: 'https://lrclib.net' },
]

const LANGUAGES: Array<[Lang, string]> = [
  ['es', 'Español'],
  ['en', 'English'],
]

/** Ventana "Acerca de": quienes somos, ayuda, licencia y privacidad. */
export function AboutDialog({ version, onClose }: Props) {
  const { t, lang } = useT()
  const [tab, setTab] = useState<Tab>('about')
  const label = (l: Label) => ('key' in l ? t(l.key) : l.text)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const open = (url: string) => void window.winmusic.openExternal(url)
  const link = (text: string, url: string) => (
    <button className="about__link" onClick={() => open(url)}>
      {text}
    </button>
  )

  return (
    <div className="dialog" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog__box about" role="dialog" aria-label={t('status.about')}>
        <div className="about__header">
          <img className="about__logo" src={logo} alt="" />
          <div>
            <div className="about__name">winMusic</div>
            <div className="about__version">{t('about.version', { v: version })}</div>
          </div>
        </div>

        <div className="about__tabs" role="tablist">
          {TABS.map(([id, key]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`about__tab${tab === id ? ' is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {t(key)}
            </button>
          ))}
        </div>

        <div className="about__body">
          {tab === 'about' && (
            <>
              <p>{t('about.description')}</p>
              <p>
                {t('about.madeBy')} <strong>@softkey</strong> · 2027
              </p>
              <ul className="about__list">
                <li>{link(t('about.site'), REPO)}</li>
                <li>{link(t('about.downloads'), `${REPO}/releases`)}</li>
                <li>{link(t('about.issues'), `${REPO}/issues`)}</li>
              </ul>
              <div className="about__row">
                <label className="about__lang">
                  {t('about.language')}
                  <select
                    className="playlist__select"
                    value={lang}
                    onChange={(e) => setLang(e.target.value as Lang)}
                  >
                    {LANGUAGES.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="dialog__btn" onClick={() => void window.winmusic.checkForUpdates()}>
                  {t('about.checkUpdates')}
                </button>
              </div>
            </>
          )}

          {tab === 'help' && (
            <>
              <h4 className="about__title">{t('about.shortcuts')}</h4>
              <table className="about__table">
                <tbody>
                  {SHORTCUTS.map(([key, action]) => (
                    <tr key={action}>
                      <td>
                        <kbd>{label(key)}</kbd>
                      </td>
                      <td>{t(action)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h4 className="about__title">{t('about.tips')}</h4>
              <ul className="about__list about__list--dots">
                {TIPS.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            </>
          )}

          {tab === 'license' && (
            <>
              <p>
                {t('about.license')} {link(t('about.viewLicense'), `${REPO}/blob/main/LICENSE`)}
              </p>
              <h4 className="about__title">{t('about.components')}</h4>
              <ul className="about__list">
                {COMPONENTS.map((c) => (
                  <li key={c.url}>
                    {label(c.name)} — {link(label(c.license), c.url)}
                  </li>
                ))}
              </ul>
              <h4 className="about__title">{t('about.privacy')}</h4>
              <p>
                {t('about.privacyText')} {link(t('about.privacyLink'), `${REPO}#privacy-policy`)}
              </p>
              <p className="about__note">{t('about.ytNote')}</p>
            </>
          )}
        </div>

        <div className="dialog__actions">
          <button className="dialog__btn" onClick={onClose}>
            {t('dlg.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
