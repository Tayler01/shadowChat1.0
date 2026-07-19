import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outputDir = resolve(here, '../assets/sounds')
const sampleRate = 44_100

const cues = {
  shadow_whisper: [[392, 0, 0.28, 0.28], [523.25, 0.105, 0.28, 0.18]],
  low_glass: [[440, 0, 0.3, 0.26], [659.25, 0.085, 0.3, 0.18]],
  gold_signal: [[659.25, 0, 0.34, 0.25], [987.77, 0.09, 0.34, 0.18]],
  hype_burst: [[523.25, 0, 0.3, 0.2], [783.99, 0.06, 0.3, 0.18], [1046.5, 0.12, 0.3, 0.14]],
  pin_shutter: [[880, 0, 0.11, 0.15], [587.33, 0.045, 0.13, 0.24], [783.99, 0.09, 0.12, 0.12]],
  connection_chime: [[493.88, 0, 0.38, 0.2], [659.25, 0.09, 0.38, 0.18], [880, 0.18, 0.36, 0.13]],
  presence_pulse: [[349.23, 0, 0.32, 0.22], [440, 0.13, 0.32, 0.14]],
  live_beacon: [[196, 0, 0.42, 0.2], [392, 0.11, 0.4, 0.16], [783.99, 0.22, 0.34, 0.12]],
  checkers_move: [[293.66, 0, 0.18, 0.3], [440, 0.055, 0.2, 0.2]],
  war_drum: [[110, 0, 0.38, 0.34], [146.83, 0.09, 0.34, 0.22], [220, 0.18, 0.28, 0.1]],
  weather_glass: [[587.33, 0, 0.48, 0.18], [739.99, 0.12, 0.44, 0.15], [880, 0.24, 0.38, 0.1]],
  security_signal: [[440, 0, 0.3, 0.23], [369.99, 0.12, 0.3, 0.2], [440, 0.24, 0.34, 0.17]],
}

const smoothEnvelope = (position) => {
  const attack = Math.min(1, position / 0.08)
  const release = Math.min(1, (1 - position) / 0.32)
  return Math.max(0, Math.sin(Math.PI * Math.min(attack, release) / 2) ** 2)
}

const writeUInt32 = (buffer, offset, value) => buffer.writeUInt32LE(value, offset)
const writeUInt16 = (buffer, offset, value) => buffer.writeUInt16LE(value, offset)

const renderCue = (notes) => {
  const duration = Math.max(...notes.map(([, start, length]) => start + length)) + 0.04
  const frameCount = Math.ceil(duration * sampleRate)
  const dataSize = frameCount * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  writeUInt32(buffer, 4, 36 + dataSize)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  writeUInt32(buffer, 16, 16)
  writeUInt16(buffer, 20, 1)
  writeUInt16(buffer, 22, 1)
  writeUInt32(buffer, 24, sampleRate)
  writeUInt32(buffer, 28, sampleRate * 2)
  writeUInt16(buffer, 32, 2)
  writeUInt16(buffer, 34, 16)
  buffer.write('data', 36)
  writeUInt32(buffer, 40, dataSize)

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / sampleRate
    let sample = 0
    for (const [frequency, start, length, amplitude] of notes) {
      if (time < start || time > start + length) continue
      const position = (time - start) / length
      const fundamental = Math.sin(2 * Math.PI * frequency * (time - start))
      const shimmer = Math.sin(2 * Math.PI * frequency * 2.005 * (time - start)) * 0.18
      sample += (fundamental + shimmer) * amplitude * smoothEnvelope(position)
    }
    const limited = Math.max(-0.92, Math.min(0.92, sample))
    buffer.writeInt16LE(Math.round(limited * 32_767), 44 + frame * 2)
  }
  return buffer
}

mkdirSync(outputDir, { recursive: true })
for (const [name, notes] of Object.entries(cues)) {
  writeFileSync(resolve(outputDir, `${name}.wav`), renderCue(notes))
}

writeFileSync(
  resolve(outputDir, 'manifest.json'),
  `${JSON.stringify({
    version: 1,
    sampleRate,
    license: 'Original ShadowChat generated assets',
    sounds: Object.keys(cues),
  }, null, 2)}\n`,
)

console.log(`Generated ${Object.keys(cues).length} notification sounds in ${outputDir}`)
