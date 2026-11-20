import { useEffect } from 'react'

/** Matiz compartido con el visualizador para que todo cambie sincronizado. */
export function rainbowHue(): number {
  return (Date.now() / 40) % 360
}

/**
 * Anima la variable CSS --accent recorriendo el arcoiris. Usa el mismo reloj
 * en todas las ventanas, asi quedan en fase sin comunicarse entre si.
 */
export function useRainbowAccent(): void {
  useEffect(() => {
    const root = document.documentElement
    const tick = () => {
      const light = root.getAttribute('data-theme') === 'light'
      const lightness = light ? 38 : 58
      root.style.setProperty('--accent', `hsl(${rainbowHue()}, 90%, ${lightness}%)`)
    }
    tick()
    const id = window.setInterval(tick, 80)
    return () => window.clearInterval(id)
  }, [])
}
