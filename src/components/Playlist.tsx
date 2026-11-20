import { useMemo, useRef, useState } from 'react'
import type { Track } from '../types'
import type { SortKey } from '../hooks/usePlaylist'
import { formatTime } from '../utils/format'
import { useT } from '../i18n'
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
  onRemove: (indices: number[]) => void
  onMove: (from: number, to: number) => void
  onMoveMany: (indices: number[], to: number) => void
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
  onCopyToList: (indices: number[], listId: string) => void
  onMoveToList: (indices: number[], listId: string) => void
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

/** Donde caeria lo arrastrado: antes o despues de la fila `index`. */
interface DropTarget {
  index: number
  after: boolean
}

export function Playlist({
  tracks,
  currentIndex,
  lists,
  activeListId,
  activeListName,
  onSelect,
  onRemove,
  onMove,
  onMoveMany,
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
  const { t } = useT()
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [query, setQuery] = useState('')
  // Seleccion por id de pista: sigue valida aunque cambien los indices.
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const draggingRef = useRef<number[] | null>(null)

  // Filtra por nombre conservando el indice real de cada pista en la lista.
  const filtering = query.trim().length > 0
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = tracks.map((track, index) => ({ track, index }))
    return needle ? all.filter(({ track }) => track.name.toLowerCase().includes(needle)) : all
  }, [tracks, query])

  const selectedIndices = useMemo(
    () => tracks.flatMap((track, index) => (selected.has(track.id) ? [index] : [])),
    [tracks, selected],
  )

  const selectOnly = (id: string) => {
    setSelected(new Set([id]))
    setAnchorId(id)
  }

  // Clic: selecciona una; Ctrl+clic: agrega o quita; Mayus+clic: rango.
  const onItemClick = (e: React.MouseEvent, track: Track) => {
    if (e.shiftKey && anchorId) {
      const ids = visible.map((v) => v.track.id)
      const a = ids.indexOf(anchorId)
      const b = ids.indexOf(track.id)
      if (a !== -1) {
        const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1)
        setSelected((prev) => new Set(e.ctrlKey ? [...prev, ...range] : range))
        return
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(track.id)) next.delete(track.id)
        else next.add(track.id)
        return next
      })
      setAnchorId(track.id)
      return
    }
    selectOnly(track.id)
  }

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' && selectedIndices.length > 0) {
      e.preventDefault()
      onRemove(selectedIndices)
      setSelected(new Set())
    } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      setSelected(new Set(visible.map((v) => v.track.id)))
    } else if (e.key === 'Enter' && selectedIndices.length > 0) {
      e.preventDefault()
      onSelect(selectedIndices[0])
    }
  }

  // --- Arrastrar para reordenar (desactivado mientras se filtra) ---
  const onDragStart = (e: React.DragEvent, track: Track, index: number) => {
    const indices = selected.has(track.id) ? selectedIndices : [index]
    if (!selected.has(track.id)) selectOnly(track.id)
    draggingRef.current = indices
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDragOver = (e: React.DragEvent, index: number) => {
    if (!draggingRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    if (dropTarget?.index !== index || dropTarget.after !== after) setDropTarget({ index, after })
  }

  const endDrag = () => {
    draggingRef.current = null
    setDropTarget(null)
  }

  const onDrop = (e: React.DragEvent) => {
    const indices = draggingRef.current
    if (!indices || !dropTarget) return
    e.preventDefault()
    onMoveMany(indices, dropTarget.index + (dropTarget.after ? 1 : 0))
    endDrag()
  }

  const openTrackMenu = (e: React.MouseEvent, track: Track, index: number) => {
    e.preventDefault()
    // Clic derecho fuera de la seleccion: actua solo sobre esa cancion.
    const indices = selected.has(track.id) ? selectedIndices : [index]
    if (!selected.has(track.id)) selectOnly(track.id)
    const count = indices.length
    const many = count > 1

    const items: MenuItem[] = [{ label: t('pl.play'), onClick: () => onSelect(index) }]
    if (!many) {
      items.push(
        {
          label: t('pl.up'),
          onClick: () => onMove(index, index - 1),
          disabled: filtering || index === 0,
          separatorBefore: true,
        },
        {
          label: t('pl.down'),
          onClick: () => onMove(index, index + 1),
          disabled: filtering || index === tracks.length - 1,
        },
      )
    }
    // Mover / copiar a otra lista, con las listas en un submenu.
    const others = lists.filter((l) => l.id !== activeListId)
    if (others.length > 0) {
      items.push(
        {
          label: many ? t('pl.moveToMany', { n: count }) : t('pl.moveTo'),
          separatorBefore: true,
          submenu: others.map((l) => ({ label: l.name, onClick: () => onMoveToList(indices, l.id) })),
        },
        {
          label: many ? t('pl.copyToMany', { n: count }) : t('pl.copyTo'),
          submenu: others.map((l) => ({ label: l.name, onClick: () => onCopyToList(indices, l.id) })),
        },
      )
    }
    if (!many && track.source === 'youtube' && track.videoId) {
      items.push({
        label: t('pl.copyLink'),
        onClick: () => void navigator.clipboard.writeText(`https://youtu.be/${track.videoId}`),
        separatorBefore: true,
      })
    }
    items.push(
      {
        label: t('pl.selectAll'),
        onClick: () => setSelected(new Set(visible.map((v) => v.track.id))),
        separatorBefore: true,
      },
      {
        label: many ? t('pl.removeMany', { n: count }) : t('pl.remove'),
        onClick: () => {
          onRemove(indices)
          setSelected(new Set())
        },
        danger: true,
      },
    )
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const openListMenu = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const items: MenuItem[] = [
      { label: t('pl.newList'), onClick: () => setDialog({ kind: 'newList' }) },
      { label: t('pl.renameList'), onClick: () => setDialog({ kind: 'renameList' }) },
      {
        label: t('pl.deleteList'),
        onClick: () => setDialog({ kind: 'deleteList' }),
        disabled: lists.length <= 1,
        danger: true,
      },
      { label: t('pl.sortName'), onClick: () => onSort('name'), separatorBefore: true, disabled: tracks.length < 2 },
      { label: t('pl.sortDuration'), onClick: () => onSort('duration'), disabled: tracks.length < 2 },
      { label: t('pl.importM3u'), onClick: onImportList, separatorBefore: true },
      { label: t('pl.exportM3u'), onClick: onExportList, disabled: tracks.length === 0 },
      { label: t('pl.exportBackup'), onClick: onExportBackup, separatorBefore: true },
      { label: t('pl.importBackup'), onClick: onImportBackup },
    ]
    setMenu({ x: rect.left, y: rect.bottom + 2, items })
  }

  const itemClass = (track: Track, index: number) => {
    let cls = 'playlist__item'
    if (index === currentIndex) cls += ' is-current'
    if (selected.has(track.id)) cls += ' is-selected'
    if (dropTarget?.index === index) cls += dropTarget.after ? ' is-drop-after' : ' is-drop-before'
    return cls
  }

  const kindIcon = (track: Track) =>
    track.kind === 'video' ? 'video' : track.source === 'youtube' ? 'search' : 'audio'

  return (
    <div className="playlist">
      <div className="playlist__toolbar">
        <button className="playlist__action" onClick={onAddFiles}>
          {t('pl.addFiles')}
        </button>
        <button className="playlist__action" onClick={onAddFolder}>
          {t('pl.addFolder')}
        </button>
        <button
          className="playlist__action playlist__action--danger"
          onClick={() => setDialog({ kind: 'clear' })}
          disabled={tracks.length === 0}
        >
          {t('pl.clear')}
        </button>
      </div>

      <div className="playlist__toolbar playlist__toolbar--lists">
        <select
          className="playlist__select"
          value={activeListId ?? ''}
          onChange={(e) => onSwitchList(e.target.value)}
          aria-label={t('pl.listLabel')}
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
          aria-label={t('pl.listOptions')}
          title={t('pl.listOptions')}
        >
          <Icon name="more" size={14} />
        </button>
        <input
          className="playlist__search"
          type="search"
          placeholder={t('pl.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('pl.searchPlaceholder')}
        />
      </div>

      <ul className="playlist__list" tabIndex={0} onKeyDown={onListKeyDown}>
        {tracks.length === 0 && <li className="playlist__empty">{t('pl.empty')}</li>}
        {tracks.length > 0 && visible.length === 0 && (
          <li className="playlist__empty">{t('pl.noMatches')}</li>
        )}
        {visible.map(({ track, index }) => (
          <li
            key={track.id}
            className={itemClass(track, index)}
            draggable={!filtering}
            onClick={(e) => onItemClick(e, track)}
            onDoubleClick={() => onSelect(index)}
            onContextMenu={(e) => openTrackMenu(e, track, index)}
            onDragStart={(e) => onDragStart(e, track, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={onDrop}
            onDragEnd={endDrag}
          >
            <span className="playlist__index">{index + 1}</span>
            <span className="playlist__kind">
              <Icon name={kindIcon(track)} size={14} />
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
                aria-label={t('pl.up')}
                title={t('pl.up')}
              >
                <Icon name="up" size={12} />
              </button>
              <button
                className="playlist__mini"
                onClick={() => onMove(index, index + 1)}
                disabled={filtering || index === tracks.length - 1}
                aria-label={t('pl.down')}
                title={t('pl.down')}
              >
                <Icon name="down" size={12} />
              </button>
              <button
                className="playlist__mini playlist__mini--danger"
                onClick={() => onRemove([index])}
                aria-label={t('pl.remove')}
                title={t('pl.remove')}
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
                ? t('pl.confirmClear')
                : t('pl.confirmDelete', { name: activeListName })}
            </p>
            <div className="dialog__actions">
              <button className="dialog__btn" onClick={() => setDialog(null)}>
                {t('dlg.cancel')}
              </button>
              <button
                className="dialog__btn dialog__btn--danger"
                onClick={() => {
                  if (dialog.kind === 'clear') onClear()
                  else onDeleteList()
                  setDialog(null)
                }}
              >
                {dialog.kind === 'clear' ? t('pl.emptyIt') : t('pl.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'newList' && (
        <PromptDialog
          title={t('pl.newListTitle')}
          confirmLabel={t('pl.create')}
          onConfirm={(name) => {
            onNewList(name)
            setDialog(null)
          }}
          onCancel={() => setDialog(null)}
        />
      )}

      {dialog?.kind === 'renameList' && (
        <PromptDialog
          title={t('pl.renameListTitle')}
          initialValue={activeListName}
          confirmLabel={t('dlg.save')}
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
