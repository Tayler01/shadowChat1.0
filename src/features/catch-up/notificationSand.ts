import { toCanvas } from 'html-to-image'

export const NOTIFICATION_SAND_DURATION_MS = 980
export const SAND_LEFT_GUTTER_PX = 112
export const SAND_RIGHT_GUTTER_PX = 24
export const SAND_VERTICAL_GUTTER_PX = 32

const MAX_PARTICLES = 7_200

export type NotificationSandSnapshot = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  backdrop: [number, number, number]
}

export type NotificationSandParticle = {
  x: number
  y: number
  birth: number
  life: number
  travelX: number
  travelY: number
  sway: number
  phase: number
  size: number
  red: number
  green: number
  blue: number
  alpha: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const noiseAt = (x: number, y: number, salt: number) => {
  let value = Math.imul(x + 1 + salt, 374_761_393)
  value = (value + Math.imul(y + 1 + salt, 668_265_263)) | 0
  value = Math.imul(value ^ (value >>> 13), 1_274_126_177)
  return ((value ^ (value >>> 16)) >>> 0) / 4_294_967_295
}

const pixelOffset = (x: number, y: number, width: number) => ((y * width) + x) * 4

export const createNotificationErosionThresholds = (
  width: number,
  height: number
) => {
  const thresholds = new Float32Array(width * height)
  const safeWidth = Math.max(1, width - 1)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const horizontalProgress = x / safeWidth
      const granularEdge = (noiseAt(x, y, 17) - 0.5) * 0.22
      thresholds[(y * width) + x] = clamp(
        0.025 + (horizontalProgress * 0.84) + granularEdge,
        0,
        0.98
      )
    }
  }
  return thresholds
}

export const createNotificationSandParticles = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  backdrop: [number, number, number] = [10, 11, 12]
) => {
  const area = width * height
  const sampleStep = Math.max(2, Math.ceil(Math.sqrt(area / MAX_PARTICLES)))
  const particles: NotificationSandParticle[] = []
  const safeWidth = Math.max(1, width - 1)

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const offset = pixelOffset(x, y, width)
      const alpha = pixels[offset + 3] ?? 0
      if (alpha < 2 || noiseAt(x, y, 31) > 0.9) continue

      const horizontalProgress = x / safeWidth
      const sourceAlpha = alpha / 255
      const grain = noiseAt(x, y, 47)
      const lift = noiseAt(x, y, 59)
      const drift = noiseAt(x, y, 71)
      const birth = clamp(
        0.025 + (horizontalProgress * 0.74) + (grain * 0.16),
        0.02,
        0.9
      )

      particles.push({
        x,
        y,
        birth,
        life: 0.26 + (noiseAt(x, y, 83) * 0.28),
        travelX: -44 - (grain * 104) - (horizontalProgress * 18),
        travelY: -34 + (lift * 60),
        sway: 3 + (drift * 9),
        phase: noiseAt(x, y, 97) * Math.PI * 2,
        size: Math.max(0.8, sampleStep * (0.38 + (noiseAt(x, y, 109) * 0.34))),
        red: Math.round(((pixels[offset] ?? 0) * sourceAlpha) + (backdrop[0] * (1 - sourceAlpha))),
        green: Math.round(((pixels[offset + 1] ?? 0) * sourceAlpha) + (backdrop[1] * (1 - sourceAlpha))),
        blue: Math.round(((pixels[offset + 2] ?? 0) * sourceAlpha) + (backdrop[2] * (1 - sourceAlpha))),
        alpha: 1,
      })
    }
  }

  return particles
}

const parseOpaqueRgb = (value: string): [number, number, number] => {
  const channels = value.match(/[\d.]+/gu)?.slice(0, 3).map(Number)
  if (!channels || channels.length < 3 || channels.some(channel => !Number.isFinite(channel))) {
    return [10, 11, 12]
  }
  return [
    Math.round(channels[0] ?? 10),
    Math.round(channels[1] ?? 11),
    Math.round(channels[2] ?? 12),
  ]
}

export async function captureNotificationSandSnapshot(
  node: HTMLElement
): Promise<NotificationSandSnapshot | null> {
  const bounds = node.getBoundingClientRect()
  if (!node.isConnected || bounds.width < 2 || bounds.height < 2) return null

  try {
    await document.fonts?.ready
  } catch {
    // The browser can still rasterize with its current fallback font.
  }

  const pixelRatio = clamp(globalThis.devicePixelRatio || 1, 1, 2)
  const canvas = await toCanvas(node, {
    backgroundColor: 'transparent',
    cacheBust: false,
    pixelRatio,
    skipAutoScale: true,
    style: {
      transform: 'none',
      translate: 'none',
    },
    filter: candidate => candidate.getAttribute?.('data-notification-sand-ignore') !== 'true',
  })

  return {
    canvas,
    width: bounds.width,
    height: bounds.height,
    backdrop: parseOpaqueRgb(globalThis.getComputedStyle(node).backgroundColor),
  }
}
