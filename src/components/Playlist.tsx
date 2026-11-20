import { useMemo, useState } from 'react'
import type { Track } from '../types'
import type { SortKey } from '../hooks/usePlaylist'
import { formatTime } from '../utils/format'
import { Icon } from './Icon'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { PromptDialog } from './PromptDialog'

interface ListInfo {
  id: string
  name: string
}

interface Props {
  tracks: Track[]
  currentIndex: number
  lists: ListInfo[]
  activeListId: string | null
  activeListName: string
  onSelect: (index: number) => void
  onRemove: (index: number) => void
  onMove: (from: number, to: number) => void
  onAddFiles: () => void
  onAddFolder: () => void
  onClear: () => void
  onSort: (key: SortKey) => void
  onSwitchList: (id: string) => void
  onNewList: (name: string) => void
  onRenameList: (name: string) => void
  onDeleteList: () => void
  onImportList: () => void
  onExportList: () => void
  onCopyToList: (index: number, listId: string) => void
  onMoveToList: (index: number, listId: string) => void
  onExportBackup: () => void
  onImportBackup: () => void
}

interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

type DialogState =
  | { kind: 'clear' }
  | { kind: 'deleteList' }
  | { kind: 'newList' }
  | { kind: 'renameList' }

export function Playlist({
  tracks,
  currentIndex,
  lists,
  activeListId,
  activeListName,
  onSelect,
  onRemove,
  onMove,
  onAddFiles,
  onAddFolder,
  onClear,
  onSort,
  onSwitchList,
  onNewList,
  onRenameList,
  onDeleteList,
  onImportList,
  onExportList,
  onCopyToList,
  onMoveToList,
  onExportBackup,
  onImportBackup,
}: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [query, setQuery] = useState('')

  // Filtra por nombre conservando el indice real de cada pista en la lista.
  const filtering = query.trim().length > 0
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = tracks.map((track, index) => ({ track, index }))
    return needle ? all.filter(({ track }) => track.name.toLowerCase().includes(needle)) : all
  }, [tracks, query])

  const openTrackMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault()
    const track = tracks[index]
    const items: MenuItem[] = [
      { label: 'Reproducir', onClick: () => onSelect(index) },
      {
        label: 'Subir',
        onClick: () => onMove(index, index - 1),
        disabled: filtering || index === 0,
        separatorBefore: true,
      },
      {
        label: 'Bajar',
        onClick: () => onMove(index, index + 1),
        disabled: filtering || index === tracks.length - 1,
      },
    ]
    // Mover / copiar a otra lista, con las listas en un submenu.
    const others = lists.filter((l) => l.id !== activeListId)
    if (others.length > 0) {
      items.push(
        {
          label: 'Mover a',
          separatorBefore: true,
          submenu: others.map((l) => ({ label: l.name, onClick: () => onMoveToList(index, l.id) })),
        },
        {
          label: 'Copiar a',
          submenu: others.map((l) => ({ label: l.name, onClick: () => onCopyToList(index, l.id) })),
        },
      )
    }
    if (track?.source === 'youtube' && track.videoId) {
      items.push({
        label: 'Copiar enlace',
        onClick: () => void navigator.clipboard.writeText(`https://youtu.be/${track.videoId}`),
        separatorBefore: true,
      })
    }
    items.push({ label: 'Quitar', onClick: () => onRemove(index), danger: true, separatorBefore: true })
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const openListMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const items: MenuItem[] = [
      { label: 'Nueva lista…', onClick: () => setDialog({ kind: 'newList' }) },
      { label: 'Renombrar lista…', onClick: () => setDialog({ kind: 'renameList' }) },
      {
        label: 'Eliminar lista',
        onClick: () => setDialog({ kind: 'deleteList' }),
        disabled: lists.length <= 1,
        danger: true,
      },
      { label: 'Ordenar por nombre', onClick: () => onSort('name'), separatorBefore: true, disabled: tracks.length < 2 },
      { label: 'Ordenar por duración', onClick: () => onSort('duration'), disabled: tracks.length < 2 },
      { label: 'Importar .m3u…', onClick: onImportList, separatorBefore: true },
      { label: 'Exportar .m3u…', onClick: onExportList, disabled: tracks.length === 0 },
      { label: 'Exportar respaldo completo…', onClick: onExportBackup, separatorBefore: true },
      { label: 'Importar respaldo completo…', onClick: onImportBackup },
    ]
    setMenu({ x: rect.left, y: rect.bottom + 2, items })
  }

  return (
    <div className="playlist">
      <div className="playlist__toolbar">
        <button className="playlist__action" onClick={onAddFiles}>
          + Archivos
        </button>
        <button className="playlist__action" onClick={onAddFolder}>
          + Carpeta
        </button>
        <button
          className="playlist__action playlist__action--danger"
          onClick={() => setDialog({ kind: 'clear' })}
          disabled={tracks.length === 0}
        >
          Limpiar
        </button>
      </div>

      <div className="playlist__toolbar playlist__toolbar--lists">
        <select
          className="playlist__select"
          value={activeListId ?? ''}
          onChange={(e) => onSwitchList(e.target.value)}
          aria-label="Lista de reproduccion"
        >
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button
          className="playlist__action playlist__action--icon"
          onClick={openListMenu}
          aria-label="Opciones de la lista"
          title="Opciones de la lista"
        >
          <Icon name="more" size={14} />
        </button>
        <input
          className="playlist__search"
          type="search"
          placeholder="Buscar en la lista…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar en la lista"
        />
      </div>

      <ul className="playlist__list">
        {tracks.length === 0 && (
          <li className="playlist__empty">Agrega archivos o una carpeta para empezar.</li>
        )}
        {tracks.length > 0 && visible.length === 0 && (
          <li className="playlist__empty">Sin coincidencias.</li>
        )}
        {visible.map(({ track, index }) => (
          <li
            key={track.id}
            className={`playlist__item${index === currentIndex ? ' is-current' : ''}`}
            onDoubleClick={() => onSelect(index)}
            onContextMenu={(e) => openTrackMenu(e, index)}
          >
            <span className="playlist__index">{index + 1}</span>
            <span className="playlist__kind" title={track.source === 'youtube' ? 'YouTube' : track.kind}>
              <Icon
                name={track.source === 'youtube' ? 'search' : track.kind === 'video' ? 'video' : 'audio'}
                size={14}
              />
            </span>
            <span className="playlist__name" title={track.name}>
              {track.name}
            </span>
            <span className="playlist__duration">
              {track.duration != null ? formatTime(track.duration) : '--:--'}
            </span>
            <span className="playlist__item-actions">
              <button
                className="playlist__mini"
                onClick={() => onMove(index, index - 1)}
                disabled={filtering || index === 0}
                aria-label="Subir"
                title="Subir"
              >
                <Icon name="up" size={12} />
              </button>
              <button
                className="playlist__mini"
                onClick={() => onMove(index, index + 1)}
                disabled={filtering || index === tracks.length - 1}
                aria-label="Bajar"
                title="Bajar"
              >
                <Icon name="down" size={12} />
              </button>
              <button
                className="playlist__mini playlist__mini--danger"
                onClick={() => onRemove(index)}
                aria-label="Quitar"
                title="Quitar"
              >
                <Icon name="remove" size={12} />
              </button>
            </span>
          </li>
        ))}
      </ul>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      {(dialog?.kind === 'clear' || dialog?.kind === 'deleteList') && (
        <div className="dialog">
          <div className="dialog__box">
            <p className="dialog__text">
              {dialog.kind === 'clear'
                ? '¿Vaciar la lista de reproducción?'
                : `¿Eliminar la lista "${activeListName}"?`}
            </p>
            <div className="dialog__actions">
              <button className="dialog__btn" onClick={() => setDialog(null)}>
                Cancelar
              </button>
              <button
                className="dialog__btn dialog__btn--danger"
                onClick={() => {
                  if (dialog.kind === 'clear') onClear()
                  else onDeleteList()
                  setDialog(null)
                }}
              >
                {dialog.kind === 'clear' ? 'Vaciar' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'newList' && (
        <PromptDialog
          title="Nombre de la nueva lista"
          confirmLabel="Crear"
          onConfirm={(name) => {
            onNewList(name)
            setDialog(null)
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'renameList' && (
        <PromptDialog
          title="Nuevo nombre de la lista"
          initialValue={activeListName}
          confirmLabel="Guardar"
          onConfirm={(name) => {
            onRenameList(name)
            setDialog(null)
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}
