import { getWorkingClient, uploadArtBoardImage } from './supabase'
import type {
  ArtBoardFrameStyle,
  ArtBoardItem,
  ArtBoardLinkLabel,
  ArtBoardNoteColor,
  ArtBoardReaction,
} from './supabase'

export const ART_BOARD_CHUNK_SIZE = 1000
export const ART_BOARD_REACTIONS: Array<{ id: ArtBoardReaction; label: string }> = [
  { id: 'heart', label: 'Love' },
  { id: 'spark', label: 'Spark' },
  { id: 'fire', label: 'Fire' },
  { id: 'idea', label: 'Idea' },
]

export const ART_BOARD_LINK_LABELS: ArtBoardLinkLabel[] = [
  'related',
  'inspired by',
  'reference',
  'part of',
  'contrast',
]

export const ART_BOARD_NOTE_COLORS: Array<{ id: ArtBoardNoteColor; label: string; className: string }> = [
  { id: 'butter', label: 'Butter', className: 'bg-[#f5e7a8] text-[#302914]' },
  { id: 'rose', label: 'Rose', className: 'bg-[#f3c3cf] text-[#34151d]' },
  { id: 'sage', label: 'Sage', className: 'bg-[#c8dfbd] text-[#1d2d1c]' },
  { id: 'sky', label: 'Sky', className: 'bg-[#b9d8ef] text-[#152b3c]' },
  { id: 'lavender', label: 'Lavender', className: 'bg-[#d6c7f2] text-[#251c37]' },
  { id: 'peach', label: 'Peach', className: 'bg-[#f1c09d] text-[#38200f]' },
]

export const ART_BOARD_FRAME_STYLES: Array<{ id: ArtBoardFrameStyle; label: string }> = [
  { id: 'clean', label: 'Clean' },
  { id: 'print', label: 'Print' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'pinned', label: 'Pinned' },
]

export const clampArtBoardItem = (item: Pick<ArtBoardItem, 'width' | 'height' | 'rotation'>) => ({
  width: Math.min(720, Math.max(96, item.width)),
  height: Math.min(720, Math.max(72, item.height)),
  rotation: Math.min(12, Math.max(-12, item.rotation)),
})

export const getArtBoardChunksForViewport = (
  centerX: number,
  centerY: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  buffer = 1
) => {
  const halfWidth = viewportWidth / Math.max(zoom, 0.25) / 2
  const halfHeight = viewportHeight / Math.max(zoom, 0.25) / 2
  const minChunkX = Math.floor((centerX - halfWidth) / ART_BOARD_CHUNK_SIZE) - buffer
  const maxChunkX = Math.floor((centerX + halfWidth) / ART_BOARD_CHUNK_SIZE) + buffer
  const minChunkY = Math.floor((centerY - halfHeight) / ART_BOARD_CHUNK_SIZE) - buffer
  const maxChunkY = Math.floor((centerY + halfHeight) / ART_BOARD_CHUNK_SIZE) + buffer

  return { minChunkX, maxChunkX, minChunkY, maxChunkY }
}

export const parseArtBoardTags = (value: string) =>
  Array.from(
    new Set(
      value
        .split(',')
        .map(tag => tag.trim().replace(/^#/, '').toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 12)

export const uploadArtBoardImageFile = async (file: File) => {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('Use a JPEG, PNG, WebP, or GIF image.')
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Images must be 10MB or smaller.')
  }

  return uploadArtBoardImage(file)
}

export const importArtBoardImageUrl = async (url: string) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.functions.invoke('art-board-import-image', {
    body: { url },
  })

  if (error) {
    throw new Error(error.message || 'Unable to import image.')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as { ok: true; path: string; publicUrl: string; contentType: string }
}
