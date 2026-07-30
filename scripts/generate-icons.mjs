/**
 * Generates PNG app icons from a simple canvas-free SVG→PNG fallback.
 * Uses the `pngjs`-free approach: writes minimal solid PNGs via sharp if available,
 * otherwise embeds a precomputed teal PNG for 192/512.
 *
 * Run: node scripts/generate-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
const publicDir = join(__dirname, '..', 'public')

mkdirSync(outDir, { recursive: true })

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** Solid teal PNG with a lighter molecule-ish circle pattern approximation */
function makePng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const rowSize = 1 + size * 3
  const raw = Buffer.alloc(rowSize * size)
  const bg = [0x0d, 0x73, 0x77]
  const light = [0xe8, 0xf6, 0xf6]
  const mid = [0x94, 0xd2, 0xbd]

  const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2

  for (let y = 0; y < size; y++) {
    const row = y * rowSize
    raw[row] = 0 // filter none
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 3
      const nx = (x / size) * 64
      const ny = (y / size) * 64
      let color = bg
      if (inCircle(nx, ny, 24, 28, 7) || inCircle(nx, ny, 38, 40, 6)) color = light
      else if (inCircle(nx, ny, 42, 24, 5)) color = mid
      raw[i] = color[0]
      raw[i + 1] = color[1]
      raw[i + 2] = color[2]
    }
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const png192 = makePng(192)
const png512 = makePng(512)

writeFileSync(join(outDir, 'icon-192.png'), png192)
writeFileSync(join(outDir, 'icon-512.png'), png512)
writeFileSync(join(publicDir, 'apple-touch-icon.png'), png192)

console.log('Wrote icons/icon-192.png, icons/icon-512.png, apple-touch-icon.png')
