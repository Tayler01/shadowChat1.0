import {
  createNotificationErosionThresholds,
  createNotificationSandParticles,
} from '../src/features/catch-up/notificationSand'

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

test('erodes the captured notification from left to right with a granular edge', () => {
  const width = 40
  const height = 12
  const thresholds = createNotificationErosionThresholds(width, height)
  const left = Array.from(thresholds).filter((_, index) => (index % width) < 10)
  const right = Array.from(thresholds).filter((_, index) => (index % width) >= 30)

  expect(thresholds).toHaveLength(width * height)
  expect(average(left)).toBeLessThan(average(right))
  expect(new Set(Array.from(thresholds).map(value => value.toFixed(3))).size).toBeGreaterThan(40)
})

test('builds deterministic sand grains from the actual captured pixel colors', () => {
  const width = 36
  const height = 18
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((y * width) + x) * 4
      pixels[offset] = x * 5
      pixels[offset + 1] = y * 9
      pixels[offset + 2] = 180
      pixels[offset + 3] = 255
    }
  }

  const first = createNotificationSandParticles(pixels, width, height)
  const second = createNotificationSandParticles(pixels, width, height)
  const leftBirths = first.filter(particle => particle.x < width / 3).map(particle => particle.birth)
  const rightBirths = first.filter(particle => particle.x > width * (2 / 3)).map(particle => particle.birth)

  expect(first.length).toBeGreaterThan(100)
  expect(first).toEqual(second)
  expect(average(leftBirths)).toBeLessThan(average(rightBirths))
  expect(first.every(particle => particle.blue === 180 && particle.alpha === 1)).toBe(true)
  expect(first.some(particle => particle.red > 0 && particle.green > 0)).toBe(true)
})
