import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  createNotificationErosionThresholds,
  createNotificationSandParticles,
  NOTIFICATION_SAND_DURATION_MS,
  SAND_LEFT_GUTTER_PX,
  SAND_RIGHT_GUTTER_PX,
  SAND_VERTICAL_GUTTER_PX,
  type NotificationSandSnapshot,
} from './notificationSand'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - (Math.pow(-2 * progress + 2, 3) / 2)
}

export function NotificationSandDisintegration({
  itemId,
  snapshot,
  originX = 0,
  onComplete,
}: {
  itemId: string
  snapshot: NotificationSandSnapshot
  originX?: number
  onComplete: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useLayoutEffect(() => {
    const outputCanvas = canvasRef.current
    if (!outputCanvas) return

    const width = Math.max(1, Math.round(snapshot.width))
    const height = Math.max(1, Math.round(snapshot.height))
    const outputWidth = width + SAND_LEFT_GUTTER_PX + SAND_RIGHT_GUTTER_PX
    const outputHeight = height + (SAND_VERTICAL_GUTTER_PX * 2)
    const renderScale = clamp(globalThis.devicePixelRatio || 1, 1, 1.5)
    outputCanvas.width = Math.ceil(outputWidth * renderScale)
    outputCanvas.height = Math.ceil(outputHeight * renderScale)
    outputCanvas.style.width = `${outputWidth}px`
    outputCanvas.style.height = `${outputHeight}px`

    const outputContext = outputCanvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
    })
    const sampleCanvas = document.createElement('canvas')
    sampleCanvas.width = width
    sampleCanvas.height = height
    const sampleContext = sampleCanvas.getContext('2d', { alpha: true, willReadFrequently: true })
    const remainingCanvas = document.createElement('canvas')
    remainingCanvas.width = width
    remainingCanvas.height = height
    const remainingContext = remainingCanvas.getContext('2d', { alpha: true })
    if (!outputContext || !sampleContext || !remainingContext) {
      onCompleteRef.current()
      return
    }

    sampleContext.imageSmoothingEnabled = true
    sampleContext.imageSmoothingQuality = 'high'
    sampleContext.drawImage(snapshot.canvas, 0, 0, width, height)

    let sourceImage: ImageData
    try {
      sourceImage = sampleContext.getImageData(0, 0, width, height)
    } catch {
      onCompleteRef.current()
      return
    }

    const remainingImage = remainingContext.createImageData(width, height)
    const sourcePixels = sourceImage.data
    const remainingPixels = remainingImage.data
    const thresholds = createNotificationErosionThresholds(width, height)
    const erosionBuckets: number[][] = Array.from({ length: 128 }, () => [])
    for (let pixel = 0; pixel < thresholds.length; pixel += 1) {
      const bucket = Math.min(
        erosionBuckets.length - 1,
        Math.max(0, Math.floor((thresholds[pixel] ?? 1) * erosionBuckets.length))
      )
      erosionBuckets[bucket]?.push((pixel * 4) + 3)
    }
    remainingPixels.set(sourcePixels)
    remainingContext.putImageData(remainingImage, 0, 0)
    const particles = createNotificationSandParticles(
      sourcePixels,
      width,
      height,
      snapshot.backdrop
    )
    outputCanvas.setAttribute('data-sand-particle-count', String(particles.length))
    outputCanvas.setAttribute('data-sand-source', 'captured-card-pixels')

    let animationFrame = 0
    let startedAt = 0
    let completed = false
    let lastClearedBucket = -1

    const complete = () => {
      if (completed) return
      completed = true
      onCompleteRef.current()
    }

    const render = (timestamp: number) => {
      if (!startedAt) startedAt = timestamp
      const rawProgress = clamp((timestamp - startedAt) / NOTIFICATION_SAND_DURATION_MS, 0, 1)
      const erosionProgress = easeInOutCubic(rawProgress)
      outputCanvas.setAttribute('data-sand-progress', erosionProgress.toFixed(3))

      const targetBucket = Math.min(
        erosionBuckets.length - 1,
        Math.floor(erosionProgress * erosionBuckets.length)
      )
      if (targetBucket > lastClearedBucket) {
        for (let bucket = lastClearedBucket + 1; bucket <= targetBucket; bucket += 1) {
          for (const alphaOffset of erosionBuckets[bucket] ?? []) {
            remainingPixels[alphaOffset] = 0
          }
        }
        lastClearedBucket = targetBucket
        remainingContext.putImageData(remainingImage, 0, 0)
      }

      outputContext.setTransform(renderScale, 0, 0, renderScale, 0, 0)
      outputContext.clearRect(0, 0, outputWidth, outputHeight)
      outputContext.drawImage(
        remainingCanvas,
        SAND_LEFT_GUTTER_PX,
        SAND_VERTICAL_GUTTER_PX,
        width,
        height
      )

      for (const particle of particles) {
        if (erosionProgress < particle.birth) continue
        const age = clamp((erosionProgress - particle.birth) / particle.life, 0, 1)
        if (age >= 1) continue

        const fade = Math.pow(1 - age, 1.45)
        const horizontalTravel = particle.travelX * ((age * 0.28) + (age * age * 0.72))
        const verticalTravel = (particle.travelY * age) + (18 * age * age)
        const windSway = Math.sin((age * Math.PI * 2.4) + particle.phase) * particle.sway * age
        const particleX = SAND_LEFT_GUTTER_PX + particle.x + horizontalTravel
        const particleY = SAND_VERTICAL_GUTTER_PX + particle.y + verticalTravel + windSway
        const size = Math.max(0.45, particle.size * (1 - (age * 0.5)))

        outputContext.fillStyle = `rgba(${particle.red},${particle.green},${particle.blue},${particle.alpha * fade})`
        outputContext.fillRect(particleX, particleY, size, size)
      }

      if (rawProgress >= 1) {
        complete()
        return
      }
      animationFrame = globalThis.requestAnimationFrame(render)
    }

    animationFrame = globalThis.requestAnimationFrame(render)
    return () => {
      globalThis.cancelAnimationFrame(animationFrame)
      completed = true
    }
  }, [snapshot])

  return (
    <div
      data-testid={`notification-disintegration-${itemId}`}
      data-notification-sand-effect="active"
      className="pointer-events-none absolute inset-0 z-[3] overflow-visible"
      style={{ transform: `translate3d(${originX}px, 0, 0)` }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        data-notification-sand-canvas
        className="absolute"
        style={{
          left: -SAND_LEFT_GUTTER_PX,
          top: -SAND_VERTICAL_GUTTER_PX,
        }}
      />
    </div>
  )
}
