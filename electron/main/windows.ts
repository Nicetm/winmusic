export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const SNAP = 14 // distancia de acople en px
/** Separacion visible entre ventanas acopladas. */
export const DOCK_GAP = 3
const EDGE_OVERLAP = 0 // tolerancia extra de solape perpendicular

function overlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.min(a2, b2) - Math.max(a1, b1)
}

/**
 * Calcula un ajuste (dx, dy) para pegar `moving` a `other` si algun par de
 * bordes esta dentro de SNAP y hay solape en el eje perpendicular. Devuelve
 * null si no hay acople.
 */
export function computeSnap(moving: Rect, other: Rect): { dx: number; dy: number } | null {
  let dx: number | null = null
  let dy: number | null = null

  const vOverlap = overlap(moving.y, moving.y + moving.height, other.y, other.y + other.height)
  const hOverlap = overlap(moving.x, moving.x + moving.width, other.x, other.x + other.width)

  // Acople horizontal (derecha/izquierda) requiere solape vertical. Deja
  // DOCK_GAP px de separacion entre los bordes que se tocan.
  if (vOverlap > EDGE_OVERLAP) {
    const movingRightToOtherLeft = other.x - DOCK_GAP - (moving.x + moving.width)
    const movingLeftToOtherRight = other.x + other.width + DOCK_GAP - moving.x
    if (Math.abs(movingRightToOtherLeft) <= SNAP) dx = movingRightToOtherLeft
    else if (Math.abs(movingLeftToOtherRight) <= SNAP) dx = movingLeftToOtherRight
  }

  // Acople vertical (arriba/abajo) requiere solape horizontal.
  if (hOverlap > EDGE_OVERLAP) {
    const movingBottomToOtherTop = other.y - DOCK_GAP - (moving.y + moving.height)
    const movingTopToOtherBottom = other.y + other.height + DOCK_GAP - moving.y
    if (Math.abs(movingBottomToOtherTop) <= SNAP) dy = movingBottomToOtherTop
    else if (Math.abs(movingTopToOtherBottom) <= SNAP) dy = movingTopToOtherBottom
  }

  // Alineacion suave de los bordes perpendiculares cuando ya hay un acople.
  if (dx !== null && dy === null) {
    const topAlign = other.y - moving.y
    const bottomAlign = other.y + other.height - (moving.y + moving.height)
    if (Math.abs(topAlign) <= SNAP) dy = topAlign
    else if (Math.abs(bottomAlign) <= SNAP) dy = bottomAlign
  }
  if (dy !== null && dx === null) {
    const leftAlign = other.x - moving.x
    const rightAlign = other.x + other.width - (moving.x + moving.width)
    if (Math.abs(leftAlign) <= SNAP) dx = leftAlign
    else if (Math.abs(rightAlign) <= SNAP) dx = rightAlign
  }

  if (dx === null && dy === null) return null
  return { dx: dx ?? 0, dy: dy ?? 0 }
}
