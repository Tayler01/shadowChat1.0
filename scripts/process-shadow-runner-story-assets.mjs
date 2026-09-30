import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const sourceRoot = 'source-assets/shadow-runner/rebuild'
const outputRoot = 'public/games/shadow-runner/rebuild'
const source = 'story-landmarks-master.png'
const original = await readFile(`${sourceRoot}/${source}`)
const metadata = await sharp(original).metadata()
assert.equal(metadata.width, metadata.height)
assert.ok(metadata.width >= 1024, 'Source atlas is too small')
assert.ok(metadata.hasAlpha, 'Landmark master must have generated transparency')
const columns = [0, 426, 850, 1280].map(value => Math.round(value * metadata.width / 1280))
const rows = [0, 410, 803, 1280].map(value => Math.round(value * metadata.height / 1280))
const names = ['oath', 'dispatch', 'forgery', 'beacon', 'gear-lock', 'shard-receiver', 'memorial', 'watchfire', 'relay']
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const manifestPath = `${sourceRoot}/processed-manifest.json`
const records = JSON.parse(await readFile(manifestPath, 'utf8')).filter(record => record.source !== source)
for (const [index, name] of names.entries()) {
  const col = index % 3
  const row = Math.floor(index / 3)
  const crop = { left: columns[col], top: rows[row], width: columns[col + 1] - columns[col], height: rows[row + 1] - rows[row] }
  const cell = await sharp(original).extract(crop).png().toBuffer()
  const bytes = await sharp(cell).trim({ threshold: 4 }).resize(128, 128,
    { fit: 'contain', background: '#00000000', kernel: 'lanczos3' }).webp({ lossless: true, effort: 6 }).toBuffer()
  assert.ok(bytes.length < 40000, `${name} exceeds sprite budget`)
  const filename = `story-${name}.webp`
  await writeFile(`${outputRoot}/${filename}`, bytes)
  records.push({ filename, width: 128, height: 128, bytes: bytes.length, sha256: hash(bytes),
    source, sourceSha256: hash(original), sourceWidth: metadata.width, sourceHeight: metadata.height, crop })
}
for (const act of ['one', 'two', 'three']) {
  const source = `act-${act}-master.png`
  const original = await readFile(`${sourceRoot}/${source}`)
  const metadata = await sharp(original).metadata()
  let bytes
  for (const quality of [82, 76, 70, 64]) {
    bytes = await sharp(original).resize(1536, 864, { fit: 'cover' })
      .webp({ quality, effort: 6 }).toBuffer()
    if (bytes.length < 300000) break
  }
  assert.ok(bytes.length < 300000, `${source} exceeds cinematic budget`)
  const filename = `act-${act}.webp`
  await writeFile(`${outputRoot}/${filename}`, bytes)
  const previous = records.findIndex(record => record.source === source)
  if (previous >= 0) records.splice(previous, 1)
  records.push({ filename, width: 1536, height: 864, bytes: bytes.length, sha256: hash(bytes),
    source, sourceSha256: hash(original), sourceWidth: metadata.width, sourceHeight: metadata.height })
}
{
  const source = 'district-depth-master.png'
  const original = await readFile(`${sourceRoot}/${source}`)
  const metadata = await sharp(original).metadata()
  assert.ok(metadata.hasAlpha, 'District depth atlas needs genuine alpha')
  for (let index = 0; index < 7; index += 1) {
    const left = Math.round(index % 4 * metadata.width / 4)
    const top = Math.round(Math.floor(index / 4) * metadata.height / 2)
    const crop = { left, top, width: Math.round((index % 4 + 1) * metadata.width / 4) - left,
      height: Math.round((Math.floor(index / 4) + 1) * metadata.height / 2) - top }
    const cell = await sharp(original).extract(crop).png().toBuffer()
    const bytes = await sharp(cell).trim({ threshold: 4 }).resize(192, 240,
      { fit: 'contain', background: '#00000000' }).webp({ lossless: true, effort: 6 }).toBuffer()
    assert.ok(bytes.length < 70000, 'Depth prop exceeds budget')
    const filename = `district-depth-${index + 1}.webp`
    await writeFile(`${outputRoot}/${filename}`, bytes)
    const previous = records.findIndex(record => record.filename === filename)
    if (previous >= 0) records.splice(previous, 1)
    records.push({ filename, width: 192, height: 240, bytes: bytes.length, sha256: hash(bytes),
      source, sourceSha256: hash(original), sourceWidth: metadata.width, sourceHeight: metadata.height, crop })
  }
}
await writeFile(manifestPath, `${JSON.stringify(records, null, 2)}\n`)
console.log(JSON.stringify(records.filter(record => record.source === source).map(({ filename, bytes }) => ({ filename, bytes }))))
