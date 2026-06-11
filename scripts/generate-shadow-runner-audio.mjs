import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SAMPLE_RATE = 44_100
const TAU = Math.PI * 2
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'games', 'shadow-runner', 'audio', 'sfx')

function clamp(value, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function sine(frequency, time) {
  return Math.sin(TAU * frequency * time)
}

function triangle(frequency, time) {
  return 2 * Math.asin(Math.sin(TAU * frequency * time)) / Math.PI
}

function square(frequency, time) {
  return Math.sign(Math.sin(TAU * frequency * time)) || 0
}

function noise(time, salt = 0) {
  const sample = Math.floor(time * SAMPLE_RATE)
  const value = Math.sin((sample + 1) * (12.9898 + salt * 0.71)) * 43_758.5453
  return (value - Math.floor(value)) * 2 - 1
}

function fade(time, duration, attack = 0.01, release = 0.04) {
  const attackGain = attack <= 0 ? 1 : clamp(time / attack, 0, 1)
  const releaseGain = release <= 0 ? 1 : clamp((duration - time) / release, 0, 1)
  return Math.min(attackGain, releaseGain)
}

function decay(time, duration, power = 2.4) {
  return Math.max(0, 1 - time / duration) ** power
}

function note(time, start, duration, frequency, wave = sine, gain = 1) {
  if (time < start || time > start + duration) return 0
  const local = time - start
  return wave(frequency, local) * fade(local, duration, 0.008, 0.04) * decay(local, duration, 1.25) * gain
}

function sweep(time, duration, startFrequency, endFrequency, wave = sine) {
  const progress = clamp(time / duration, 0, 1)
  const frequency = startFrequency + (endFrequency - startFrequency) * progress
  return wave(frequency, time)
}

function writeWavBuffer(samples) {
  const dataSize = samples.length * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  samples.forEach((sample, index) => {
    buffer.writeInt16LE(Math.round(clamp(sample) * 32767), 44 + index * 2)
  })

  return buffer
}

async function writeEffect(name, duration, render, gain = 0.82) {
  const sampleCount = Math.ceil(duration * SAMPLE_RATE)
  const samples = Array.from({ length: sampleCount }, (_item, index) => {
    const time = index / SAMPLE_RATE
    return clamp(render(time, duration) * gain)
  })
  await writeFile(path.join(OUTPUT_DIR, `${name}.wav`), writeWavBuffer(samples))
}

const effects = {
  'menu-click': {
    duration: 0.14,
    gain: 0.62,
    render: time => (
      note(time, 0, 0.07, 720, triangle, 0.8)
      + note(time, 0.035, 0.095, 1180, sine, 0.58)
    ),
  },
  'menu-back': {
    duration: 0.18,
    gain: 0.58,
    render: time => (
      note(time, 0, 0.08, 760, triangle, 0.72)
      + note(time, 0.055, 0.12, 430, triangle, 0.58)
    ),
  },
  'menu-denied': {
    duration: 0.2,
    gain: 0.42,
    render: (time, duration) => (
      sweep(time, duration, 180, 120, square) * decay(time, duration, 1.4) * 0.5
      + noise(time, 2) * decay(time, duration, 2.1) * 0.12
    ),
  },
  'level-select': {
    duration: 0.34,
    gain: 0.6,
    render: time => (
      note(time, 0, 0.12, 523.25, triangle, 0.56)
      + note(time, 0.06, 0.14, 659.25, triangle, 0.6)
      + note(time, 0.13, 0.18, 987.77, sine, 0.45)
    ),
  },
  pause: {
    duration: 0.16,
    gain: 0.54,
    render: (time, duration) => sweep(time, duration, 700, 410, triangle) * fade(time, duration) * decay(time, duration, 1.7),
  },
  resume: {
    duration: 0.16,
    gain: 0.56,
    render: (time, duration) => sweep(time, duration, 410, 780, triangle) * fade(time, duration) * decay(time, duration, 1.4),
  },
  jump: {
    duration: 0.22,
    gain: 0.48,
    render: (time, duration) => (
      sweep(time, duration, 260, 720, sine) * fade(time, duration, 0.012, 0.05) * decay(time, duration, 1.25)
      + noise(time, 4) * decay(time, duration, 3.2) * 0.12
    ),
  },
  'double-jump': {
    duration: 0.28,
    gain: 0.5,
    render: (time, duration) => (
      sweep(time, duration, 420, 1180, triangle) * fade(time, duration, 0.012, 0.06) * decay(time, duration, 1.15) * 0.72
      + sine(1460, time) * decay(time, duration, 2.2) * 0.22
      + noise(time, 6) * decay(time, duration, 2.6) * 0.08
    ),
  },
  land: {
    duration: 0.2,
    gain: 0.62,
    render: (time, duration) => (
      sweep(time, duration, 120, 58, sine) * decay(time, duration, 1.4) * 0.7
      + noise(time, 8) * decay(time, duration, 4.5) * 0.23
    ) * fade(time, duration, 0.002, 0.055),
  },
  'sword-swing': {
    duration: 0.24,
    gain: 0.48,
    render: (time, duration) => (
      sweep(time, duration, 1280, 310, triangle) * fade(time, duration, 0.006, 0.045) * decay(time, duration, 1.1) * 0.46
      + noise(time, 10) * fade(time, duration, 0.005, 0.04) * decay(time, duration, 1.7) * 0.22
    ),
  },
  'enemy-hit': {
    duration: 0.22,
    gain: 0.64,
    render: (time, duration) => (
      sweep(time, duration, 170, 92, square) * decay(time, duration, 1.8) * 0.34
      + noise(time, 12) * decay(time, duration, 3.6) * 0.24
      + note(time, 0.025, 0.09, 540, triangle, 0.22)
    ) * fade(time, duration, 0.004, 0.055),
  },
  stomp: {
    duration: 0.24,
    gain: 0.66,
    render: (time, duration) => (
      sweep(time, duration, 105, 45, sine) * decay(time, duration, 1.1) * 0.78
      + noise(time, 14) * decay(time, duration, 4) * 0.18
    ) * fade(time, duration, 0.002, 0.06),
  },
  'player-hurt': {
    duration: 0.26,
    gain: 0.54,
    render: (time, duration) => (
      sweep(time, duration, 360, 170, square) * decay(time, duration, 1.2) * 0.34
      + sweep(time, duration, 880, 330, sine) * decay(time, duration, 1.45) * 0.22
      + noise(time, 16) * decay(time, duration, 2.6) * 0.12
    ) * fade(time, duration, 0.004, 0.065),
  },
  'life-lost': {
    duration: 0.55,
    gain: 0.58,
    render: (time, duration) => (
      note(time, 0, 0.22, 330, triangle, 0.42)
      + note(time, 0.14, 0.25, 246.94, triangle, 0.44)
      + note(time, 0.3, 0.24, 164.81, sine, 0.5)
    ) * fade(time, duration, 0.008, 0.12),
  },
  respawn: {
    duration: 0.42,
    gain: 0.52,
    render: (time, duration) => (
      sweep(time, duration, 260, 980, sine) * decay(duration - time, duration, 1.5) * fade(time, duration, 0.03, 0.09) * 0.25
      + note(time, 0.16, 0.18, 659.25, triangle, 0.34)
      + note(time, 0.25, 0.14, 987.77, sine, 0.3)
    ),
  },
  coin: {
    duration: 0.32,
    gain: 0.56,
    render: time => (
      note(time, 0, 0.16, 987.77, sine, 0.48)
      + note(time, 0.055, 0.18, 1567.98, sine, 0.36)
      + note(time, 0.12, 0.16, 2093, triangle, 0.2)
    ),
  },
  'enemy-defeat': {
    duration: 0.5,
    gain: 0.6,
    render: (time, duration) => (
      sweep(time, duration, 190, 78, sine) * decay(time, duration, 1.7) * 0.42
      + noise(time, 18) * decay(time, duration, 2.4) * 0.18
      + note(time, 0.12, 0.18, 880, triangle, 0.24)
      + note(time, 0.2, 0.22, 1320, sine, 0.16)
    ) * fade(time, duration, 0.004, 0.12),
  },
  'level-complete': {
    duration: 0.95,
    gain: 0.54,
    render: time => (
      note(time, 0, 0.22, 523.25, triangle, 0.42)
      + note(time, 0.11, 0.22, 659.25, triangle, 0.42)
      + note(time, 0.22, 0.24, 783.99, triangle, 0.44)
      + note(time, 0.38, 0.32, 1046.5, sine, 0.38)
      + note(time, 0.52, 0.38, 1567.98, sine, 0.28)
    ),
  },
  'route-failed': {
    duration: 0.78,
    gain: 0.56,
    render: time => (
      note(time, 0, 0.28, 392, triangle, 0.34)
      + note(time, 0.18, 0.34, 293.66, triangle, 0.38)
      + note(time, 0.42, 0.32, 196, sine, 0.48)
      + noise(time, 20) * Math.max(0, 1 - time / 0.78) ** 3 * 0.08
    ),
  },
}

await mkdir(OUTPUT_DIR, { recursive: true })

for (const [name, effect] of Object.entries(effects)) {
  await writeEffect(name, effect.duration, effect.render, effect.gain)
}

console.log(`Generated ${Object.keys(effects).length} Shadow Runner SFX in ${OUTPUT_DIR}`)
