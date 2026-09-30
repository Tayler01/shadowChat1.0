import { resolveUploadMimeType } from './uploadLimits'

export type ImageOptimizeOptions = {
  maxWidth: number
  maxHeight: number
  quality?: number
  minBytes?: number
  outputType?: 'image/webp' | 'image/jpeg'
  fileNamePrefix?: string
  maxInputPixels?: number
}

const DEFAULT_MIN_BYTES = 220 * 1024
const DEFAULT_QUALITY = 0.84

const SKIPPED_IMAGE_TYPES = new Set(['image/gif', 'image/svg+xml'])

const extensionForType = (type: string) => (type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg')

const getOptimizedFileName = (file: File, type: string, prefix?: string) => {
  const extension = extensionForType(type)
  const baseName = (file.name || 'image')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image'
  return `${prefix || baseName}-${Date.now()}.${extension}`
}

const loadImage = async (file: File) => {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
    return null
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Failed to load image for optimization'))
      image.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const canvasToBlob = async (
  canvas: HTMLCanvasElement,
  type: 'image/webp' | 'image/jpeg',
  quality: number
) => new Promise<Blob | null>(resolve => {
  canvas.toBlob(resolve, type, quality)
})

export const optimizeImageFile = async (
  file: File,
  options: ImageOptimizeOptions
): Promise<File> => {
  const mimeType = resolveUploadMimeType(file)
  if (!mimeType.startsWith('image/') || SKIPPED_IMAGE_TYPES.has(mimeType)) {
    return file
  }

  const minBytes = options.minBytes ?? DEFAULT_MIN_BYTES
  if (file.size > 0 && file.size < minBytes && !options.maxInputPixels) {
    return file
  }

  const image = await loadImage(file).catch(() => null)
  if (!image?.naturalWidth || !image.naturalHeight) {
    return file
  }
  if (options.maxInputPixels && image.naturalWidth * image.naturalHeight > options.maxInputPixels) {
    throw new Error('Image dimensions are too large to process safely. Choose a smaller image.')
  }
  if (file.size > 0 && file.size < minBytes) {
    return file
  }

  const scale = Math.min(1, options.maxWidth / image.naturalWidth, options.maxHeight / image.naturalHeight)
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale))
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale))
  const shouldResize = targetWidth !== image.naturalWidth || targetHeight !== image.naturalHeight
  const shouldTranscode = mimeType !== (options.outputType || 'image/webp')

  if (!shouldResize && !shouldTranscode && file.size < minBytes * 2) {
    return file
  }

  // Let the composer paint its processing state before a potentially expensive canvas draw.
  await new Promise<void>(resolve => setTimeout(resolve, 0))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) {
    return file
  }

  const outputType = options.outputType || 'image/webp'
  if (outputType === 'image/jpeg') {
    context.fillStyle = '#0d0f10'
    context.fillRect(0, 0, targetWidth, targetHeight)
  }
  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  const optimized = await canvasToBlob(canvas, outputType, options.quality ?? DEFAULT_QUALITY)
    || await canvasToBlob(canvas, 'image/jpeg', options.quality ?? DEFAULT_QUALITY)

  if (!optimized || (file.size > 0 && optimized.size >= file.size * 0.95)) {
    return file
  }

  return new File(
    [optimized],
    getOptimizedFileName(file, optimized.type || outputType, options.fileNamePrefix),
    { type: optimized.type || outputType }
  )
}
