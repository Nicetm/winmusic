import { useState } from 'react'
import type { YtSearchResult } from '../../electron/preload'
import { Icon } from './Icon'
import { formatTime } from '../utils/format'

interface Props {
  onPlay: (result: YtSearchResult) => void
  onAdd: (result: YtSearchResult) => void
}

export function YoutubeSearch({ onPlay, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YtSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError(null)
    try {
      const found = await window.winmusic.youtubeSearch(q)
      setResults(found)
      if (found.length === 0) setError('Sin resultados')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de búsqueda')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ytsearch">
      <div className="ytsearch__bar">
        <input
          className="ytsearch__input"
          type="text"
          placeholder="Buscar en YouTube…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search()
          }}
          aria-label="Buscar en YouTube"
        />
        <button
          className="ytsearch__go"
          onClick={() => void search()}
          disabled={loading}
          aria-label="Buscar"
        >
          {loading ? '…' : 'Buscar'}
        </button>
      </div>

      {error && <div className="ytsearch__error">{error}</div>}

      <ul className="ytsearch__list">
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
                onClick={() => onPlay(r)}
                aria-label="Reproducir ahora"
                title="Reproducir ahora"
              >
                <Icon name="play" size={14} />
              </button>
              <button
                className="ytsearch__action"
                onClick={() => onAdd(r)}
                aria-label="Agregar a la lista"
                title="Agregar a la lista"
              >
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
