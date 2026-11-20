import { useEffect, useRef, useState } from 'react'

export interface MenuItem {
  label: string
  /** Opcional si el item abre un submenu. */
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  separatorBefore?: boolean
  submenu?: MenuItem[]
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

const MENU_WIDTH = 180
const ITEM_HEIGHT = 30

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  // Evita que el menu se salga del borde derecho/inferior.
  const left = Math.min(x, window.innerWidth - MENU_WIDTH)
  const top = Math.min(y, window.innerHeight - items.length * ITEM_HEIGHT - 8)
  // Si no cabe a la derecha, el submenu se abre hacia la izquierda.
  const subToLeft = left + MENU_WIDTH * 2 > window.innerWidth

  const runItem = (item: MenuItem) => {
    if (item.disabled || !item.onClick) return
    item.onClick()
    onClose()
  }

  return (
    <div ref={ref} className="ctxmenu" style={{ left, top }} role="menu">
      {items.map((item, i) => {
        const hasSub = !!item.submenu && item.submenu.length > 0
        return (
          <div
            key={i}
            className="ctxmenu__entry"
            onMouseEnter={() => setOpenIndex(hasSub && !item.disabled ? i : null)}
          >
            {item.separatorBefore && <div className="ctxmenu__sep" />}
            <button
              className={`ctxmenu__item${item.danger ? ' ctxmenu__item--danger' : ''}${
                openIndex === i ? ' is-open' : ''
              }`}
              disabled={item.disabled}
              onClick={() => (hasSub ? setOpenIndex(i) : runItem(item))}
              role="menuitem"
              aria-haspopup={hasSub || undefined}
            >
              {item.label}
              {hasSub && <span className="ctxmenu__arrow">›</span>}
            </button>
            {hasSub && openIndex === i && (
              <div
                className={`ctxmenu ctxmenu--sub${subToLeft ? ' ctxmenu--sub-left' : ''}`}
                role="menu"
              >
                {item.submenu!.map((sub, j) => (
                  <button
                    key={j}
                    className={`ctxmenu__item${sub.danger ? ' ctxmenu__item--danger' : ''}`}
                    disabled={sub.disabled}
                    onClick={() => runItem(sub)}
                    role="menuitem"
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
