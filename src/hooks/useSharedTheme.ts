import { useEffect } from 'react'

/**
 * Aplica el tema guardado (claro/oscuro) en una ventana secundaria y lo
 * actualiza cuando la principal lo cambia (via evento storage).
 */
export function useSharedTheme(): void {
  useEffect(() => {
    const apply = () => {
      const theme = localStorage.getItem('wm-theme') || 'dark'
      document.documentElement.setAttribute('data-theme', theme)
    }
    apply()
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'wm-theme') apply()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
}
