import { useRef, useState } from 'react'
import type { YtSearchResult } from '../../electron/preload'
import { formatTime } from '../utils/format'
import { useT } from '../i18n'

interface Props {
  onAdd: (result: YtSearchResult, asVideo: boolean) => void
}

// Igual a SEARCH_PAGE_SIZE del main: una pagina incompleta indica que no hay mas.
const PAGE_SIZE = 10
const MODE_KEY = 'wm-yt-mode'

export function YoutubeSearch({ onAdd }: Props) {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [searchedQuery, setSearchedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<YtSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Agregar como audio (por defecto) o como video.
  const [asVideo, setAsVideo] = useState(() => localStorage.getItem(MODE_KEY) === 'video')
  const listRef = useRef<HTMLUListElement | null>(null)
  // Evita que una respuesta lenta pise a una busqueda posterior.
  const requestRef = useRef(0)

  const changeMode = (video: boolean) => {
    setAsVideo(video)
    localStorage.setItem(MODE_KEY, video ? 'video' : 'audio')
  }

  const load = async (q: string, targetPage: number) => {
    const request = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const found = await window.winmusic.youtubeSearch(q, targetPage)
      if (request !== requestRef.current) return
      setResults(found)
      setSearchedQuery(q)
      setPage(targetPage)
      if (found.length === 0) setError(targetPage === 1 ? t('yt.noResults') : t('yt.noMore'))
      listRef.current?.scrollTo({ top: 0 })
    } catch (e) {
      if (request !== requestRef.current) return
      setError(e instanceof Error ? e.message : t('yt.error'))
      setResults([])
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }

  const search = () => {
    const q = query.trim()
    if (q) void load(q, 1)
  }

  const hasPrev = page > 1
  const hasNext = results.length === PAGE_SIZE

  return (
    <div className="ytsearch">
      <div className="ytsearch__bar">
        <input
          className="ytsearch__input"
          type="text"
          placeholder={t('yt.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search()
          }}
          aria-label={t('win.searchTitle')}
        />
        <button className="ytsearch__go" onClick={search} disabled={loading} aria-label={t('yt.search')}>
          {loading ? '…' : t('yt.search')}
        </button>
      </div>

      <div className="ytsearch__mode" role="radiogroup" title={t('yt.modeTitle')}>
        <button
          role="radio"
          aria-checked={!asVideo}
          className={`ytsearch__mode-btn${!asVideo ? ' is-active' : ''}`}
          onClick={() => changeMode(false)}
        >
          {t('yt.modeAudio')}
        </button>
        <button
          role="radio"
          aria-checked={asVideo}
          className={`ytsearch__mode-btn${asVideo ? ' is-active' : ''}`}
          onClick={() => changeMode(true)}
        >
          {t('yt.modeVideo')}
        </button>
      </div>

      {error && <div className="ytsearch__error">{error}</div>}

      <ul className="ytsearch__list" ref={listRef}>
        {results.map((r) => (
          <li className="ytsearch__item" key={r.id}>
            <span className="ytsearch__title" title={r.title}>
              {r.title}
            </span>
            <span className="ytsearch__meta">
              {r.channel ?? ''}
              {r.duration != null ? ` · ${formatTime(r.duration)}` : ''}
            </span>
            <span className="ytsearch__actions">
              <button
                className="ytsearch__action"
                onClick={() => onAdd(r, asVideo)}
                aria-label={t('yt.add')}
                title={t('yt.add')}
              >
                +
              </button>
            </span>
          </li>
        ))}
      </ul>

      {searchedQuery && (hasPrev || hasNext) && (
        <div className="ytsearch__pager">
          <button
            className="ytsearch__page-btn"
            onClick={() => void load(searchedQuery, page - 1)}
            disabled={loading || !hasPrev}
          >
            {t('yt.prev')}
          </button>
          <span className="ytsearch__page">{loading ? t('yt.loading') : t('yt.page', { n: page })}</span>
          <button
            className="ytsearch__page-btn"
            onClick={() => void load(searchedQuery, page + 1)}
            disabled={loading || !hasNext}
          >
            {t('yt.next')}
          </button>
        </div>
      )}
    </div>
  )
}
