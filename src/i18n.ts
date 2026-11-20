import { useCallback, useSyncExternalStore } from 'react'
import { es, type MessageKey } from './locales/es'
import { en } from './locales/en'

export type Lang = 'es' | 'en'
export type { MessageKey }

const DICTS: Record<Lang, Record<MessageKey, string>> = { es, en }
const STORAGE_KEY = 'wm-lang'

function readLang(): Lang {
  return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'es'
}

let current: Lang = readLang()
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

// Las demas ventanas (EQ, buscador) se enteran del cambio por localStorage.
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return
  current = readLang()
  emit()
})

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  localStorage.setItem(STORAGE_KEY, lang)
  document.documentElement.lang = lang
  emit()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Traduce una clave; `{nombre}` en el texto se reemplaza con `vars.nombre`. */
export function translate(key: MessageKey, vars?: Record<string, string | number>): string {
  const text = DICTS[current][key] ?? DICTS.es[key] ?? key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

/** Hook: devuelve `t` y re-renderiza el componente al cambiar el idioma. */
export function useT() {
  const lang = useSyncExternalStore(subscribe, getLang)
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(key, vars),
    // `lang` cambia la identidad de t para que los efectos que la usan se actualicen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  )
  return { t, lang }
}

document.documentElement.lang = current
