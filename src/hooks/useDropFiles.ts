import { useCallback, useEffect, useRef, useState } from 'react'

/** true si lo que se arrastra son archivos del sistema (no un item interno). */
function isFileDrag(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
}

/**
 * Habilita arrastrar y soltar archivos o carpetas sobre la ventana.
 * Previene en fase de captura el comportamiento por defecto del navegador
 * (que navegaria al archivo soltado), resuelve las rutas absolutas via
 * preload y las entrega al callback.
 */
export function useDropFiles(onPaths: (paths: string[]) => void) {
  const [dragging, setDragging] = useState(false)
  const depthRef = useRef(0)

  const onDrop = useCallback(
    async (e: DragEvent) => {
      // Arrastres internos (reordenar la lista) no traen archivos: se dejan
      // pasar para que los maneje la lista.
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.stopPropagation()
      depthRef.current = 0
      setDragging(false)
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      const paths: string[] = []
      for (const file of Array.from(files)) {
        const p = window.winmusic.pathForFile(file)
        if (p) paths.push(p)
      }
      if (paths.length === 0) return
      const resolved = await window.winmusic.resolveDropped(paths)
      if (resolved.length > 0) onPaths(resolved)
    },
    [onPaths],
  )

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      depthRef.current += 1
      setDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      depthRef.current = Math.max(0, depthRef.current - 1)
      if (depthRef.current === 0) setDragging(false)
    }

    const opts = { capture: true }
    document.addEventListener('dragenter', onDragEnter, opts)
    document.addEventListener('dragover', onDragOver, opts)
    document.addEventListener('dragleave', onDragLeave, opts)
    document.addEventListener('drop', onDrop, opts)
    return () => {
      document.removeEventListener('dragenter', onDragEnter, opts)
      document.removeEventListener('dragover', onDragOver, opts)
      document.removeEventListener('dragleave', onDragLeave, opts)
      document.removeEventListener('drop', onDrop, opts)
    }
  }, [onDrop])

  return { dragging }
}
