import { ENEMY_KINDS, type Actor, type CircuitLevel, type Direction, type Link } from '../core/types.ts'

export type RawField = { type: number; raw: number[] }
export type RawLevel = { recordIndex: number; number: number; timeLimit: number; requiredChips: number; upper: number[]; lower: number[]; fields: RawField[] }
export type RawPack = { magic: number; levels: RawLevel[] }
const LEGACY_DIRECTIONS: readonly Direction[] = [0, 3, 2, 1]

class Reader {
  private position = 0
  private bytes: Uint8Array
  constructor(bytes: Uint8Array) { this.bytes = bytes }
  get remaining() { return this.bytes.length - this.position }
  take(length: number) {
    if (length < 0 || length > this.remaining) throw new Error('Truncated DAT record.')
    const slice = this.bytes.slice(this.position, this.position + length); this.position += length; return slice
  }
  byte() { return this.take(1)[0] }
  word() { const b = this.take(2); return b[0] | b[1] << 8 }
  end() { if (this.remaining) throw new Error('Unexpected trailing DAT bytes.') }
}

function layer(bytes: Uint8Array) {
  const reader = new Reader(bytes); const result: number[] = []
  while (reader.remaining) {
    let tile = reader.byte(); let count = 1
    if (tile === 255) { count = reader.byte(); tile = reader.byte() }
    if (tile > 111 || count < 1 || result.length + count > 1024) throw new Error('Invalid DAT tile or RLE length.')
    for (let i = 0; i < count; i++) result.push(tile)
  }
  if (result.length !== 1024) throw new Error('DAT layers must contain exactly 1024 cells.')
  return result
}

/** Bounded decoder retaining both layers and every optional payload. No ZIP or script execution. */
export function parseLegacyDat(bytes: Uint8Array): RawPack {
  if (bytes.byteLength > 16 * 1024 * 1024) throw new Error('DAT exceeds the 16 MiB limit.')
  const reader = new Reader(bytes)
  const magic = (reader.word() | reader.word() << 16) >>> 0
  if (![0x0002aaac, 0x0102aaac].includes(magic)) throw new Error('Unsupported DAT signature.')
  const count = reader.word()
  if (count < 1 || count > 4096) throw new Error('Unsupported DAT level count.')
  const levels: RawLevel[] = []
  for (let recordIndex = 0; recordIndex < count; recordIndex++) {
    const record = new Reader(reader.take(reader.word()))
    const number = record.word(); const timeLimit = record.word(); const requiredChips = record.word()
    if (record.word() !== 1) throw new Error('Unsupported DAT compression.')
    const upper = layer(record.take(record.word())); const lower = layer(record.take(record.word()))
    const optional = new Reader(record.take(record.word())); record.end()
    const fields: RawField[] = []
    while (optional.remaining) {
      const type = optional.byte(); const raw = Array.from(optional.take(optional.byte()))
      if (type === 4 || type === 5) {
        const width = type === 4 ? 10 : 8
        if (raw.length % width) throw new Error('Malformed DAT mechanism links.')
        for (let n = 0; n < raw.length; n += width) for (let j = 0; j < 8; j += 2) {
          if ((raw[n + j] | raw[n + j + 1] << 8) >= 32) throw new Error('DAT link is out of bounds.')
        }
      }
      if (type === 10 && (raw.length % 2 || raw.some(v => v >= 32))) throw new Error('Malformed DAT actor order.')
      fields.push({ type, raw })
    }
    levels.push({ recordIndex, number, timeLimit, requiredChips, upper, lower, fields })
  }
  reader.end()
  return { magic, levels }
}

const CP1252 = [0x20ac, 0xfffd, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0xfffd, 0x17d, 0xfffd, 0xfffd, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0xfffd, 0x17e, 0x178]
function textField(raw: RawLevel, type: number): string {
  const bytes = [...(raw.fields.find(f => f.type === type)?.raw ?? [])]
  if (bytes[bytes.length - 1] === 0) bytes.pop()
  return bytes.map(b => {
    const value = type === 6 ? b ^ 0x99 : b
    return String.fromCodePoint(value >= 128 && value <= 159 ? CP1252[value - 128] : value)
  }).join('').replace(/\0/g, '\ufffd')
}

function actorFor(tile: number, cell: number, id: number): Actor | null {
  const base = { id, cell, previous: cell, readyAt: 0, alive: true }
  if (tile === 10) return { ...base, kind: 'block', direction: 0 }
  if (tile >= 14 && tile <= 17) return { ...base, kind: 'block', direction: LEGACY_DIRECTIONS[tile - 14] }
  if (tile >= 64 && tile <= 99) return { ...base, kind: ENEMY_KINDS[Math.floor((tile - 64) / 4)], direction: LEGACY_DIRECTIONS[tile % 4] }
  if (tile >= 108 && tile <= 111) return { ...base, kind: 'player', direction: LEGACY_DIRECTIONS[tile % 4] }
  return null
}

function linksFor(raw: RawLevel, type: 4 | 5): Link[] {
  const result: Link[] = []
  for (const field of raw.fields.filter(f => f.type === type)) {
    const b = field.raw
    for (let n = 0; n < b.length; n += type === 4 ? 10 : 8) result.push({ button: b[n] + 32 * b[n + 2], target: b[n + 4] + 32 * b[n + 6] })
  }
  return result
}

export function normalizeLegacyLevel(raw: RawLevel, sourceHash: string, campaignId = 'imported'): CircuitLevel {
  if (!/^[a-f0-9]{64}$/i.test(sourceHash)) throw new Error('A verified pack SHA-256 is required.')
  const top = [...raw.upper]; const bottom = [...raw.lower]; const actors: Actor[] = []; const warnings: string[] = []
  const fieldTypes = raw.fields.map(f => f.type)
  if (new Set(fieldTypes).size !== fieldTypes.length) throw new Error('Duplicate metadata fields require review before play.')
  for (let cell = 0; cell < 1024; cell++) {
    for (const tile of [top[cell], bottom[cell]]) if (tile === 0x20 || (tile >= 0x33 && tile <= 0x3f)) throw new Error(`Internal source tile 0x${tile.toString(16)} requires review.`)
    if (actorFor(bottom[cell], cell, 0)) throw new Error('Actors hidden in the lower layer require compatibility review.')
    const actor = actorFor(top[cell], cell, actors.length)
    if (actor) { actors.push(actor); top[cell] = bottom[cell]; bottom[cell] = 0 }
  }
  if (actors.filter(a => a.kind === 'player').length !== 1) throw new Error('Level must contain exactly one explorer.')
  const order = raw.fields.find(f => f.type === 10)?.raw ?? []
  const orderedCells: number[] = []
  for (let n = 0; n < order.length; n += 2) orderedCells.push(order[n] + order[n + 1] * 32)
  if (new Set(orderedCells).size !== orderedCells.length) throw new Error('Duplicate actor-order positions require review.')
  if (orderedCells.some(cell => !actors.some(a => a.cell === cell && a.kind !== 'player'))) warnings.push('Actor-order field includes a non-actor coordinate.')
  actors.sort((a, b) => {
    const ai = orderedCells.indexOf(a.cell); const bi = orderedCells.indexOf(b.cell)
    return (ai < 0 ? 1024 + a.id : ai) - (bi < 0 ? 1024 + b.id : bi)
  })
  warnings.push('shadow-grid-v0: exact MS timing and campaign solution compatibility are not verified.')
  return {
    id: `${campaignId}:${sourceHash.slice(0, 16)}:${raw.recordIndex}`, campaignId, contentHash: `${sourceHash}:${raw.recordIndex}`,
    title: textField(raw, 3) || `Level ${raw.number}`, number: raw.number, hint: textField(raw, 7), password: textField(raw, 6),
    width: 32, height: 32, top, bottom, actors, requiredChips: raw.requiredChips, timeLimit: raw.timeLimit,
    traps: linksFor(raw, 4), clones: linksFor(raw, 5), source: 'imported', warnings,
  }
}
