import { useRef, useState } from 'react'
import type { YtSearchResult } from '../../electron/preload'
import { Icon } from './Icon'
import { formatTime } from '../utils/format'

interface Props {
  onPlay: (result: YtSearchResult) => void
  onAdd: (result: YtSearchResult) => void
}

// Igual a SEARCH_PAGE_SIZE del main: una pagina incompleta indica que no hay mas.
const PAGE_SIZE = 10

export function YoutubeSearch({ onPlay, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [searchedQuery, setSearchedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<YtSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  // Evita que una respuesta lenta pise a una busqueda posterior.
  const requestRef = useRef(0)

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
      if (found.length === 0) setError(targetPage === 1 ? 'Sin resultados' : 'No hay más resultados')
      listRef.current?.scrollTo({ top: 0 })
    } catch (e) {
      if (request !== requestRef.current) return
      setError(e instanceof Error ? e.message : 'Error de búsqueda')
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
          placeholder="Buscar en YouTube…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search()
          }}
          aria-label="Buscar en YouTube"
        />
        <button className="ytsearch__go" onClick={search} disabled={loading} aria-label="Buscar">
          {loading ? '…' : 'Buscar'}
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

      {searchedQuery && (hasPrev || hasNext) && (
        <div className="ytsearch__pager">
          <button
            className="ytsearch__page-btn"
            onClick={() => void load(searchedQuery, page - 1)}
            disabled={loading || !hasPrev}
            aria-label="Pagina anterior"
          >
            ‹ Anterior
          </button>
          <span className="ytsearch__page">{loading ? 'Cargando…' : `Página ${page}`}</span>
          <button
            className="ytsearch__page-btn"
            onClick={() => void load(searchedQuery, page + 1)}
            disabled={loading || !hasNext}
            aria-label="Pagina siguiente"
          >
            Siguiente ›
          </button>
        </div>
      )}
    </div>
  )
}
