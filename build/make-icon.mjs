// Genera build/icon.ico (256x256) con el logotipo de winMusic sin dependencias externas.
import { writeFileSync } from 'node:fs'
import zlib from 'node:zlib'

const SIZE = 256

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

// Construye RGBA del icono: fondo oscuro con una nota musical verde.
function buildPixels() {
  const px = Buffer.alloc(SIZE * SIZE * 4)
  const cx = SIZE / 2
  const cy = SIZE / 2
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4
      // Fondo circular
      const d = Math.hypot(x - cx, y - cy)
      if (d > SIZE / 2 - 4) {
        px[i] = 0
        px[i + 1] = 0
        px[i + 2] = 0
        px[i + 3] = 0
        continue
      }
      const t = y / SIZE
      px[i] = Math.round(35 + t * -20)
      px[i + 1] = Math.round(38 + t * -22)
      px[i + 2] = Math.round(42 + t * -26)
      px[i + 3] = 255
    }
  }

  const green = [57, 255, 20]
  const setPx = (x, y) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
    const i = (y * SIZE + x) * 4
    px[i] = green[0]
    px[i + 1] = green[1]
    px[i + 2] = green[2]
    px[i + 3] = 255
  }

  // Dos cabezas de nota (elipses rellenas)
  const drawNoteHead = (ox, oy) => {
    const rx = 34
    const ry = 24
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) setPx(ox + x, oy + y)
      }
    }
  }
  drawNoteHead(96, 180)
  drawNoteHead(176, 160)

  // Plicas (barras verticales)
  const drawStem = (x) => {
    for (let y = 70; y <= 180; y++) for (let w = 0; w < 8; w++) setPx(x + w, y)
  }
  drawStem(126)
  drawStem(206)

  // Corchete superior que une las plicas
  for (let x = 126; x <= 214; x++) {
    const y = 70 + Math.round(((x - 126) / 88) * 10)
    for (let h = 0; h < 14; h++) setPx(x, y + h)
  }

  return px
}

function encodePng(pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0
    pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function wrapIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type icon
  header.writeUInt16LE(1, 4) // count
  const entry = Buffer.alloc(16)
  entry[0] = 0 // 256 -> 0
  entry[1] = 0
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(6 + 16, 12)
  return Buffer.concat([header, entry, png])
}

const png = encodePng(buildPixels())
writeFileSync(new URL('./icon.png', import.meta.url), png)
writeFileSync(new URL('./icon.ico', import.meta.url), wrapIco(png))
console.log('icon.ico and icon.png generated')
