import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Check,
  Flame,
  Heart,
  Image as ImageIcon,
  Italic,
  Lightbulb,
  Link2,
  List,
  Move,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Sparkles,
  StickyNote,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { ChatMessageActionsMenu, type ChatMessageAction } from '../chat/ChatMessageActionsMenu'
import { useArtBoard, type CreateArtBoardItemInput, type UpdateArtBoardItemInput } from '../../hooks/useArtBoard'
import { useAuth } from '../../hooks/useAuth'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import {
  ART_BOARD_FRAME_STYLES,
  ART_BOARD_LINK_LABELS,
  ART_BOARD_NOTE_COLORS,
  ART_BOARD_REACTIONS,
  clampArtBoardItem,
  importArtBoardImageUrl,
  parseArtBoardTags,
  uploadArtBoardImageFile,
} from '../../lib/artBoard'
import { getBlockedActionMessage } from '../../lib/moderation'
import { getSupabaseImageTransformUrl } from '../../lib/storageImageTransforms'
import { showActionErrorToast } from '../../lib/toastNotifications'
import { cn, formatTime } from '../../lib/utils'
import type {
  ArtBoardFrameStyle,
  ArtBoardItem,
  ArtBoardLink,
  ArtBoardLinkLabel,
  ArtBoardNoteColor,
  ArtBoardReaction,
} from '../../lib/supabase'

const MIN_ZOOM = 0.35
const MAX_ZOOM = 1.8
const LONG_PRESS_MS = 430
const DRAFT_SAVE_DELAY_MS = 900
const getArtBoardCanvasImageUrl = (item: ArtBoardItem) =>
  item.thumbnail_url || getSupabaseImageTransformUrl(item.image_url, {
    width: Math.max(320, Math.min(1600, item.width * 3)),
    height: Math.max(320, Math.min(1600, item.height * 3)),
    resize: 'cover',
    quality: 78,
  })

const getArtBoardDetailImageUrl = (url?: string | null) =>
  getSupabaseImageTransformUrl(url, {
    width: 1600,
    height: 1600,
    resize: 'contain',
    quality: 82,
  })

const getArtBoardThumbnailUrl = (item?: Pick<ArtBoardItem, 'image_url' | 'thumbnail_url'> | null) =>
  item?.thumbnail_url || getSupabaseImageTransformUrl(item?.image_url, {
    width: 160,
    height: 160,
    resize: 'cover',
    quality: 76,
  })

type AddMode = 'image' | 'note' | null
type PointerMode = 'pan' | 'move'

interface CanvasPoint {
  x: number
  y: number
}

interface CanvasSize {
  width: number
  height: number
}

interface PinchGesture {
  pointerIds: [number, number]
  startDistance: number
  startZoom: number
  worldAtMidpoint: CanvasPoint
}

interface DraftItem extends Omit<ArtBoardItem, 'id' | 'created_at' | 'updated_at' | 'chunk_x' | 'chunk_y'> {
  id: 'draft'
  created_at: string
  updated_at: string
  chunk_x: number
  chunk_y: number
}

const reactionIcons: Record<ArtBoardReaction, React.ComponentType<{ className?: string }>> = {
  heart: Heart,
  spark: Sparkles,
  fire: Flame,
  idea: Lightbulb,
}

const noteColorClass = (color: ArtBoardNoteColor) =>
  ART_BOARD_NOTE_COLORS.find(entry => entry.id === color)?.className ?? ART_BOARD_NOTE_COLORS[0].className

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

const toTagInput = (tags: string[]) => tags.map(tag => `#${tag}`).join(', ')

const getItemOwnerName = (item?: ArtBoardItem | DraftItem | null) =>
  item?.user?.display_name || item?.user?.username || 'Unknown artist'

const getLinkOtherId = (link: ArtBoardLink, itemId: string) =>
  link.item_a_id === itemId ? link.item_b_id : link.item_a_id

const getItemCenter = (item: ArtBoardItem | DraftItem) => ({
  x: item.position_x + item.width / 2,
  y: item.position_y + item.height / 2,
})

const getPointDistance = (a: CanvasPoint, b: CanvasPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y)

const getPointMidpoint = (a: CanvasPoint, b: CanvasPoint) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

const isPrimaryPointerButton = (event: React.PointerEvent) =>
  event.pointerType === 'touch' || event.button === 0 || event.buttons === 1

const capturePointerSafely = (target: Element, pointerId: number) => {
  const pointerTarget = target as Element & { setPointerCapture?: (id: number) => void }
  try {
    pointerTarget.setPointerCapture?.(pointerId)
  } catch {
    // Synthetic test events and some interrupted mobile gestures can lose capture eligibility.
  }
}

const formatTags = (tags: string[]) => tags.map(tag => `#${tag}`).join(' ')

const normalizeError = async (error: unknown) =>
  getBlockedActionMessage('art_board', error, error instanceof Error ? error.message : 'Art Board action failed')

const renderStickyInline = (text: string, lineKey: string) => {
  const parts: React.ReactNode[] = []
  const pattern = /(https?:\/\/[^\s]+|\*\*([^*]+)\*\*|_([^_]+)_)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const [raw, url, boldText, italicText] = match
    if (url?.startsWith('http')) {
      parts.push(
        <a
          key={`${lineKey}-${match.index}-link`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline decoration-current/35 underline-offset-2"
        >
          {url}
        </a>
      )
    } else if (boldText) {
      parts.push(<strong key={`${lineKey}-${match.index}-bold`}>{boldText}</strong>)
    } else if (italicText) {
      parts.push(<em key={`${lineKey}-${match.index}-italic`}>{italicText}</em>)
    } else {
      parts.push(raw)
    }
    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

function StickyRichText({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]', className)}>
      {content.split('\n').map((line, index) => {
        const bullet = line.match(/^\s*[-*]\s+(.+)$/)
        if (bullet) {
          return (
            <div key={index} className="flex gap-1.5">
              <span aria-hidden="true">-</span>
              <span className="min-w-0 flex-1">{renderStickyInline(bullet[1], `${index}-bullet`)}</span>
            </div>
          )
        }

        return (
          <React.Fragment key={index}>
            {renderStickyInline(line, `${index}-line`)}
            {index < content.split('\n').length - 1 && '\n'}
          </React.Fragment>
        )
      })}
    </div>
  )
}

const applyTextFormat = (
  element: HTMLTextAreaElement | null,
  value: string,
  setValue: (value: string) => void,
  format: 'bold' | 'italic' | 'bullet'
) => {
  const start = element?.selectionStart ?? value.length
  const end = element?.selectionEnd ?? value.length
  const selected = value.slice(start, end)
  let replacement = ''
  let selectionStart = start
  let selectionEnd = start

  if (format === 'bold') {
    replacement = selected ? `**${selected}**` : '****'
    selectionStart = selected ? start + replacement.length : start + 2
    selectionEnd = selectionStart
  } else if (format === 'italic') {
    replacement = selected ? `_${selected}_` : '__'
    selectionStart = selected ? start + replacement.length : start + 1
    selectionEnd = selectionStart
  } else {
    replacement = selected
      ? selected.split('\n').map(line => `- ${line.replace(/^\s*[-*]\s+/, '')}`).join('\n')
      : '- '
    selectionStart = start + replacement.length
    selectionEnd = selectionStart
  }

  const nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`
  setValue(nextValue)

  window.requestAnimationFrame(() => {
    element?.focus()
    element?.setSelectionRange(selectionStart, selectionEnd)
  })
}

function StickyFormatToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black/18 p-1">
      <button type="button" onClick={() => applyTextFormat(textareaRef.current, value, onChange, 'bold')} className="rounded-[var(--radius-sm)] p-2 text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]" aria-label="Bold">
        <Bold className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => applyTextFormat(textareaRef.current, value, onChange, 'italic')} className="rounded-[var(--radius-sm)] p-2 text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]" aria-label="Italic">
        <Italic className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => applyTextFormat(textareaRef.current, value, onChange, 'bullet')} className="rounded-[var(--radius-sm)] p-2 text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]" aria-label="Bullet list">
        <List className="h-4 w-4" />
      </button>
    </div>
  )
}

const getReactionActions = (onReact: (reaction: ArtBoardReaction) => void): ChatMessageAction[] =>
  ART_BOARD_REACTIONS.map(reaction => ({
    id: `reaction-${reaction.id}`,
    label: reaction.label,
    icon: reactionIcons[reaction.id],
    onSelect: () => onReact(reaction.id),
  }))

function ArtReactionBadges({
  reactions,
  className,
}: {
  reactions?: ArtBoardItem['reactions']
  className?: string
}) {
  const entries = ART_BOARD_REACTIONS
    .map(reaction => ({
      ...reaction,
      count: reactions?.[reaction.id]?.count ?? 0,
      Icon: reactionIcons[reaction.id],
    }))
    .filter(reaction => reaction.count > 0)

  if (!entries.length) return null

  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-2 right-2 z-20 flex max-w-[78%] flex-wrap justify-end gap-1',
        className
      )}
      aria-label="Art item reactions"
    >
      {entries.map(({ id, label, count, Icon }) => (
        <span
          key={id}
          className="inline-flex min-h-6 items-center gap-1 rounded-full border border-[rgba(215,170,70,0.25)] bg-[rgba(8,9,10,0.76)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-gold)] shadow-[0_6px_16px_rgba(0,0,0,0.3)] backdrop-blur"
          title={`${label}: ${count}`}
        >
          <Icon className="h-3 w-3" />
          {count}
        </span>
      ))}
    </div>
  )
}

function ArtBoardItemCard({
  item,
  stackIndex,
  selected,
  editing,
  canEdit,
  canDelete,
  onPointerDown,
  onSelectAction,
  onDoneEditing,
  onReact,
}: {
  item: ArtBoardItem | DraftItem
  stackIndex: number
  selected: boolean
  editing: boolean
  canEdit: boolean
  canDelete: boolean
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onSelectAction: (action: 'edit' | 'foreground' | 'background' | 'link' | 'delete') => void
  onDoneEditing: () => void
  onReact: (reaction: ArtBoardReaction) => void
}) {
  const actions: ChatMessageAction[] = [
    ...getReactionActions(onReact),
    {
      id: 'edit',
      label: 'Edit',
      icon: Pencil,
      hidden: !canEdit,
      onSelect: () => onSelectAction('edit'),
    },
    {
      id: 'foreground',
      label: 'Bring forward',
      icon: ArrowUpToLine,
      hidden: !canEdit,
      onSelect: () => onSelectAction('foreground'),
    },
    {
      id: 'background',
      label: 'Send back',
      icon: ArrowDownToLine,
      hidden: !canEdit,
      onSelect: () => onSelectAction('background'),
    },
    {
      id: 'link',
      label: 'Link to item',
      icon: Link2,
      onSelect: () => onSelectAction('link'),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      tone: 'danger',
      hidden: !canDelete,
      onSelect: () => onSelectAction('delete'),
    },
  ]

  return (
    <div
      data-testid="art-board-item"
      className={cn(
        'group absolute select-none touch-none',
        editing && 'z-[900]',
        selected && !editing && 'z-[800]'
      )}
      style={{
        left: item.position_x,
        top: item.position_y,
        width: item.width,
        height: item.height,
        transform: `rotate(${item.rotation}deg)`,
        zIndex: editing ? 10002 : selected ? 10001 : stackIndex,
      }}
      onPointerDown={onPointerDown}
    >
      <div
        className={cn(
          'relative h-full w-full overflow-hidden rounded-[var(--radius-sm)] border transition-shadow',
          item.item_type === 'note'
            ? `border-black/10 ${noteColorClass(item.note_color)} shadow-[0_18px_28px_rgba(0,0,0,0.28)]`
            : 'border-[rgba(67,52,28,0.35)] bg-[#11100d] shadow-[0_18px_34px_rgba(0,0,0,0.34)]',
          item.item_type === 'image' && item.frame_style === 'print' && 'p-2 bg-[#e9dfcc]',
          item.item_type === 'image' && item.frame_style === 'polaroid' && 'bg-[#eee4d5] p-2 pb-9',
          item.item_type === 'image' && item.frame_style === 'pinned' && 'p-1 bg-[#d8c8ae]',
          selected && 'ring-2 ring-[rgba(215,170,70,0.74)]',
          editing && 'ring-2 ring-[rgba(143,216,189,0.82)]'
        )}
      >
        {item.item_type === 'image' ? (
          <>
            {item.frame_style === 'pinned' && (
              <span className="absolute left-1/2 top-1 z-10 h-3 w-3 -translate-x-1/2 rounded-full border border-black/20 bg-[var(--text-gold)] shadow-[0_2px_8px_rgba(0,0,0,0.45)]" />
            )}
            <img
              src={getArtBoardCanvasImageUrl(item)}
              alt={item.alt_text || item.title || item.caption || 'Art board image'}
              draggable={false}
              loading="lazy"
              decoding="async"
              className="h-full w-full rounded-[calc(var(--radius-sm)-2px)] object-cover"
            />
            {item.frame_style === 'polaroid' && (
              <p className="absolute bottom-2 left-3 right-3 truncate text-center text-xs font-medium text-[#4a3a25]">
                {item.title || item.caption || ''}
              </p>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col p-3">
            {item.title && <p className="mb-1 truncate text-sm font-bold">{item.title}</p>}
            <StickyRichText content={item.note_text || ''} className="line-clamp-[10] text-sm leading-5" />
          </div>
        )}

        {selected && (
          <div
            className="absolute right-2 top-2 flex items-center gap-1"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
          >
            <ChatMessageActionsMenu
              actions={actions}
              buttonLabel="Art item actions"
              className="rounded-full border border-[var(--border-subtle)] bg-[rgba(9,10,11,0.72)]"
            />
          </div>
        )}
        <ArtReactionBadges reactions={item.reactions} />
      </div>

      {editing && canEdit && (
        <>
          <div
            className="absolute -left-2 -top-9 flex items-center gap-1 rounded-full border border-[rgba(143,216,189,0.35)] bg-[rgba(7,9,9,0.88)] px-2 py-1 text-[var(--text-primary)] shadow-[var(--shadow-panel)]"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
          >
            <Move className="h-3.5 w-3.5 text-[rgb(143,216,189)]" />
            <button type="button" onClick={() => onSelectAction('background')} className="rounded-full p-1 hover:bg-white/10" aria-label="Send back">
              <ArrowDownToLine className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onSelectAction('foreground')} className="rounded-full p-1 hover:bg-white/10" aria-label="Bring forward">
              <ArrowUpToLine className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={onDoneEditing} className="rounded-full p-1 hover:bg-white/10" aria-label="Done editing">
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation()
              onDoneEditing()
            }}
            className="absolute -bottom-3 -right-3 h-7 w-7 rounded-full border border-[rgba(143,216,189,0.5)] bg-[rgba(7,9,9,0.92)] text-[rgb(143,216,189)] shadow-[var(--shadow-panel)]"
            aria-label="Exit item move mode"
          >
            <Check className="mx-auto h-4 w-4" />
          </button>
        </>
      )}
    </div>
  )
}

function AddArtDialog({
  mode,
  onClose,
  onCreateDraft,
}: {
  mode: AddMode
  onClose: () => void
  onCreateDraft: (input: Omit<CreateArtBoardItemInput, 'position_x' | 'position_y' | 'z_index'>) => void
}) {
  const [source, setSource] = useState<'upload' | 'url'>('upload')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [tags, setTags] = useState('')
  const [altText, setAltText] = useState('')
  const [noteText, setNoteText] = useState('')
  const [noteColor, setNoteColor] = useState<ArtBoardNoteColor>('butter')
  const [frameStyle, setFrameStyle] = useState<ArtBoardFrameStyle>('print')
  const [submitting, setSubmitting] = useState(false)
  const noteTextRef = useRef<HTMLTextAreaElement>(null)

  if (!mode) return null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'image') {
        const uploaded = source === 'upload'
          ? imageFile
            ? await uploadArtBoardImageFile(imageFile)
            : null
          : imageUrl.trim()
            ? await importArtBoardImageUrl(imageUrl.trim())
            : null

        if (!uploaded) {
          throw new Error(source === 'upload' ? 'Choose an image first.' : 'Enter an image URL first.')
        }

        onCreateDraft({
          item_type: 'image',
          title: title.trim() || null,
          caption: caption.trim() || null,
          tags: parseArtBoardTags(tags),
          image_url: uploaded.publicUrl,
          image_path: uploaded.path,
          thumbnail_url: uploaded.thumbnailUrl,
          thumbnail_path: uploaded.thumbnailPath,
          alt_text: altText.trim() || null,
          frame_style: frameStyle,
          note_color: 'butter',
          width: 280,
          height: frameStyle === 'polaroid' ? 330 : 240,
          rotation: 0,
        })
      } else {
        if (!noteText.trim()) {
          throw new Error('Sticky notes need text.')
        }

        onCreateDraft({
          item_type: 'note',
          title: title.trim() || null,
          caption: caption.trim() || null,
          tags: parseArtBoardTags(tags),
          note_text: noteText.trim(),
          note_color: noteColor,
          frame_style: 'clean',
          width: 260,
          height: 190,
          rotation: 0,
        })
      }

      onClose()
    } catch (error) {
      showActionErrorToast(await normalizeError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/62 px-3 pb-3 pt-10 backdrop-blur-sm sm:items-center">
      <form onSubmit={submit} className="popup-surface max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[var(--radius-lg)] p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Art Board</p>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {mode === 'image' ? 'Add image' : 'Add sticky note'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]" aria-label="Close add art dialog">
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'image' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSource('upload')}
                className={cn('rounded-[var(--radius-md)] border px-3 py-2 text-sm', source === 'upload' ? 'border-[var(--border-glow)] text-[var(--text-gold)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]')}
              >
                <Upload className="mr-2 inline h-4 w-4" />
                Upload
              </button>
              <button
                type="button"
                onClick={() => setSource('url')}
                className={cn('rounded-[var(--radius-md)] border px-3 py-2 text-sm', source === 'url' ? 'border-[var(--border-glow)] text-[var(--text-gold)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]')}
              >
                <Link2 className="mr-2 inline h-4 w-4" />
                URL
              </button>
            </div>
            {source === 'upload' ? (
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={event => setImageFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white/5 p-3 text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-full file:border-0 file:bg-[rgba(215,170,70,0.18)] file:px-3 file:py-1.5 file:text-[var(--text-gold)]"
              />
            ) : (
              <input
                value={imageUrl}
                onChange={event => setImageUrl(event.target.value)}
                placeholder="https://example.com/image.jpg"
                className="obsidian-input w-full rounded-[var(--radius-md)] px-3 py-2 text-base md:text-sm"
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              {ART_BOARD_FRAME_STYLES.map(style => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setFrameStyle(style.id)}
                  className={cn('rounded-[var(--radius-md)] border px-3 py-2 text-sm', frameStyle === style.id ? 'border-[var(--border-glow)] text-[var(--text-gold)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]')}
                >
                  {style.label}
                </button>
              ))}
            </div>
            <input value={altText} onChange={event => setAltText(event.target.value)} placeholder="Alt text" className="obsidian-input w-full rounded-[var(--radius-md)] px-3 py-2 text-base md:text-sm" />
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              ref={noteTextRef}
              value={noteText}
              onChange={event => setNoteText(event.target.value)}
              rows={5}
              placeholder="Write the note..."
              className="obsidian-input w-full resize-none rounded-[var(--radius-md)] px-3 py-2 text-base md:text-sm"
            />
            <StickyFormatToolbar textareaRef={noteTextRef} value={noteText} onChange={setNoteText} />
            <div className="grid grid-cols-3 gap-2">
              {ART_BOARD_NOTE_COLORS.map(color => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => setNoteColor(color.id)}
                  className={cn('rounded-[var(--radius-md)] border px-3 py-2 text-sm', color.className, noteColor === color.id ? 'border-[var(--border-glow)] ring-2 ring-[rgba(215,170,70,0.28)]' : 'border-black/10')}
                >
                  {color.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 grid gap-2">
          <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Title" className="obsidian-input w-full rounded-[var(--radius-md)] px-3 py-2 text-base md:text-sm" />
          <textarea value={caption} onChange={event => setCaption(event.target.value)} rows={2} placeholder="Caption" className="obsidian-input w-full resize-none rounded-[var(--radius-md)] px-3 py-2 text-base md:text-sm" />
          <input value={tags} onChange={event => setTags(event.target.value)} placeholder="tags, comma separated" className="obsidian-input w-full rounded-[var(--radius-md)] px-3 py-2 text-base md:text-sm" />
        </div>

        <Button type="submit" className="mt-4 w-full justify-center" loading={submitting}>
          Place on board
        </Button>
      </form>
    </div>
  )
}

function DetailDialog({
  item,
  links,
  itemsById,
  canEdit,
  canDelete,
  canManageLink,
  onClose,
  onReact,
  onAction,
  onJumpToItem,
  onUpdateLink,
  onDeleteLink,
}: {
  item: ArtBoardItem
  links: ArtBoardLink[]
  itemsById: Map<string, ArtBoardItem>
  canEdit: boolean
  canDelete: boolean
  canManageLink: (link: ArtBoardLink) => boolean
  onClose: () => void
  onReact: (reaction: ArtBoardReaction) => void
  onAction: (action: 'edit' | 'foreground' | 'background' | 'link' | 'delete') => void
  onJumpToItem: (item: ArtBoardItem) => void
  onUpdateLink: (link: ArtBoardLink, label: ArtBoardLinkLabel) => void
  onDeleteLink: (link: ArtBoardLink) => void
}) {
  const actions: ChatMessageAction[] = [
    ...getReactionActions(onReact),
    { id: 'edit', label: 'Edit', icon: Pencil, hidden: !canEdit, onSelect: () => onAction('edit') },
    { id: 'foreground', label: 'Bring forward', icon: ArrowUpToLine, hidden: !canEdit, onSelect: () => onAction('foreground') },
    { id: 'background', label: 'Send back', icon: ArrowDownToLine, hidden: !canEdit, onSelect: () => onAction('background') },
    { id: 'link', label: 'Link to item', icon: Link2, onSelect: () => onAction('link') },
    { id: 'delete', label: 'Delete', icon: Trash2, tone: 'danger', hidden: !canDelete, onSelect: () => onAction('delete') },
  ]

  return (
    <div className="absolute inset-0 z-[95] flex items-stretch justify-center bg-black/70 p-2 backdrop-blur-sm md:fixed md:inset-0 md:items-center md:p-4">
      <div className="popup-surface flex h-full max-h-full w-full max-w-none flex-col overflow-hidden rounded-[var(--radius-lg)] md:h-auto md:max-h-[90vh] md:max-w-4xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border-panel)] bg-[rgba(12,13,13,0.92)] px-4 py-3 backdrop-blur-xl">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Art Board</p>
            <h2 className="truncate text-lg font-semibold text-[var(--text-primary)]">{item.title || 'Untitled'}</h2>
          </div>
          <div className="flex items-center gap-2">
            <ChatMessageActionsMenu actions={actions} buttonLabel="Art detail actions" />
            <button type="button" onClick={onClose} className="rounded-full p-2 text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]" aria-label="Close art detail">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0">
            {item.item_type === 'image' ? (
              <div className="relative">
                <img
                  src={getArtBoardDetailImageUrl(item.image_url)}
                  alt={item.alt_text || item.title || item.caption || 'Art board image'}
                  loading="eager"
                  decoding="async"
                  className="max-h-[62vh] w-full rounded-[var(--radius-md)] object-contain"
                />
                <ArtReactionBadges reactions={item.reactions} />
              </div>
            ) : (
              <div className={cn('relative min-h-48 rounded-[var(--radius-md)] p-5 shadow-[var(--shadow-panel)]', noteColorClass(item.note_color))}>
                <StickyRichText content={item.note_text || ''} className="text-base leading-7" />
                <ArtReactionBadges reactions={item.reactions} />
              </div>
            )}
            {item.caption && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{item.caption}</p>}
          </div>

          <aside className="space-y-4">
            <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white/[0.035] p-3">
              <Avatar
                src={item.user?.avatar_url}
                alt={getItemOwnerName(item)}
                color={item.user?.color}
                userId={item.user?.id}
                presenceVisibility={item.user?.presence_visibility}
                showStatus
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{getItemOwnerName(item)}</p>
                <p className="text-xs text-[var(--text-muted)]">{formatTime(item.created_at)}</p>
              </div>
            </div>

            {item.tags.length > 0 && (
              <section className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white/[0.035] p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Tags</p>
                <p className="text-sm leading-6 text-[var(--text-secondary)]">{formatTags(item.tags)}</p>
              </section>
            )}

            <section className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white/[0.035] p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Linked</p>
              {links.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No links yet.</p>
              ) : (
                <div className="space-y-2">
                  {links.map(link => {
                    const other = itemsById.get(getLinkOtherId(link, item.id))
                    if (!other) return null
                    return (
                      <div key={link.id} className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-black/18 p-2">
                        <button type="button" onClick={() => onJumpToItem(other)} className="flex w-full items-center gap-2 text-left">
                          <span className="h-10 w-10 overflow-hidden rounded-[var(--radius-sm)] bg-black/30">
                            {other.item_type === 'image' ? (
                              <img src={getArtBoardThumbnailUrl(other)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                            ) : (
                              <span className={cn('block h-full w-full', noteColorClass(other.note_color))} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-[var(--text-primary)]">{other.title || other.caption || other.note_text || 'Untitled'}</span>
                            <span className="block truncate text-xs text-[var(--text-muted)]">{link.label}</span>
                          </span>
                        </button>
                        {canManageLink(link) && (
                          <div className="mt-2 flex gap-2">
                            <select
                              value={link.label}
                              onChange={event => onUpdateLink(link, event.target.value as ArtBoardLinkLabel)}
                              className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-black/28 px-2 py-1 text-xs text-[var(--text-primary)]"
                            >
                              {ART_BOARD_LINK_LABELS.map(label => <option key={label} value={label}>{label}</option>)}
                            </select>
                            <button type="button" onClick={() => onDeleteLink(link)} className="rounded-[var(--radius-sm)] px-2 text-[rgb(255,155,178)] hover:bg-white/5" aria-label="Delete link">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}

function EditPanel({
  item,
  onClose,
  onSave,
}: {
  item: ArtBoardItem
  onClose: () => void
  onSave: (updates: UpdateArtBoardItemInput) => void
}) {
  const [title, setTitle] = useState(item.title ?? '')
  const [caption, setCaption] = useState(item.caption ?? '')
  const [tags, setTags] = useState(toTagInput(item.tags))
  const [noteText, setNoteText] = useState(item.note_text ?? '')
  const [noteColor, setNoteColor] = useState<ArtBoardNoteColor>(item.note_color)
  const [frameStyle, setFrameStyle] = useState<ArtBoardFrameStyle>(item.frame_style)
  const [altText, setAltText] = useState(item.alt_text ?? '')
  const noteTextRef = useRef<HTMLTextAreaElement>(null)

  const save = () => {
    onSave({
      title: title.trim() || null,
      caption: caption.trim() || null,
      tags: parseArtBoardTags(tags),
      note_text: item.item_type === 'note' ? noteText.trim() : item.note_text,
      note_color: noteColor,
      frame_style: frameStyle,
      alt_text: item.item_type === 'image' ? altText.trim() || null : item.alt_text,
    })
    onClose()
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[96] mx-auto max-w-xl rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(10,11,12,0.94)] p-3 shadow-[var(--shadow-panel-strong)] backdrop-blur-xl md:bottom-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Edit item</p>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-[var(--text-muted)] hover:bg-white/5" aria-label="Close edit panel"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-2">
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Title" className="obsidian-input rounded-[var(--radius-md)] px-3 py-2 text-base md:text-sm" />
        {item.item_type === 'note' ? (
          <>
            <textarea ref={noteTextRef} value={noteText} onChange={event => setNoteText(event.target.value)} rows={3} className="obsidian-input resize-none rounded-[var(--radius-md)] px-3 py-2 text-base md:text-sm" />
            <StickyFormatToolbar textareaRef={noteTextRef} value={noteText} onChange={setNoteText} />
            <div className="grid grid-cols-3 gap-1.5">
              {ART_BOARD_NOTE_COLORS.map(color => (
                <button key={color.id} type="button" onClick={() => setNoteColor(color.id)} className={cn('rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs', color.className, noteColor === color.id ? 'border-[var(--border-glow)]' : 'border-black/10')}>
                  {color.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <input value={altText} onChange={event => setAltText(event.target.value)} placeholder="Alt text" className="obsidian-input rounded-[var(--radius-md)] px-3 py-2 text-base md:text-sm" />
            <div className="grid grid-cols-4 gap-1.5">
              {ART_BOARD_FRAME_STYLES.map(style => (
                <button key={style.id} type="button" onClick={() => setFrameStyle(style.id)} className={cn('rounded-[var(--radius-sm)] border px-2 py-1.5 text-xs', frameStyle === style.id ? 'border-[var(--border-glow)] text-[var(--text-gold)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]')}>
                  {style.label}
                </button>
              ))}
            </div>
          </>
        )}
        <textarea value={caption} onChange={event => setCaption(event.target.value)} rows={2} placeholder="Caption" className="obsidian-input resize-none rounded-[var(--radius-md)] px-3 py-2 text-base md:text-sm" />
        <input value={tags} onChange={event => setTags(event.target.value)} placeholder="tags, comma separated" className="obsidian-input rounded-[var(--radius-md)] px-3 py-2 text-base md:text-sm" />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button type="button" size="sm" onClick={save}>Save</Button>
      </div>
    </div>
  )
}

export function ArtBoardAboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/62 px-4 backdrop-blur-sm">
      <div className="popup-surface w-full max-w-md rounded-[var(--radius-lg)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Art Board</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-[var(--text-muted)] hover:bg-white/5" aria-label="Close Art Board about">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
          <p>Browse the shared studio board, add images or sticky notes, and connect related pieces with labeled links.</p>
          <p>Tap once to select. Tap selected art again to open details. Long-press your own item to move it. Changes autosave after you stop adjusting.</p>
          <p>Admins can remove items from the context menu. Art Board bans block adding, editing, linking, and reactions while browsing stays open.</p>
        </div>
      </div>
    </div>
  )
}

export function ArtBoard() {
  const { profile } = useAuth()
  const { isOperator } = useAdminAccess({ includeUsers: false })
  const {
    items,
    links,
    loading,
    error,
    loadViewport,
    createItem,
    updateItem,
    deleteItem,
    toggleReaction,
    createLink,
    updateLink,
    deleteLink,
  } = useArtBoard()
  const containerRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef<{
    mode: PointerMode
    pointerId: number
    startClient: CanvasPoint
    startPan: CanvasPoint
    itemId?: string
    startItem?: ArtBoardItem | DraftItem
  } | null>(null)
  const activePointersRef = useRef<Map<number, CanvasPoint>>(new Map())
  const pinchRef = useRef<PinchGesture | null>(null)
  const longPressTimerRef = useRef<number | null>(null)
  const draftSaveTimerRef = useRef<number | null>(null)
  const initialFitRef = useRef(false)
  const [viewportSize, setViewportSize] = useState<CanvasSize>({ width: 1, height: 1 })
  const [pan, setPan] = useState<CanvasPoint>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.9)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openDetailId, setOpenDetailId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<AddMode>(null)
  const [addChooserOpen, setAddChooserOpen] = useState(false)
  const [draftItem, setDraftItem] = useState<DraftItem | null>(null)
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null)
  const [pendingLinkTargetId, setPendingLinkTargetId] = useState<string | null>(null)
  const [editPanelItem, setEditPanelItem] = useState<ArtBoardItem | null>(null)
  const [localItems, setLocalItems] = useState<ArtBoardItem[]>([])

  useEffect(() => {
    setLocalItems(items)
  }, [items])

  const allItems = useMemo(() => (
    draftItem ? [...localItems, draftItem as unknown as ArtBoardItem] : localItems
  ), [draftItem, localItems])

  const itemsById = useMemo(() => new Map(localItems.map(item => [item.id, item])), [localItems])
  const selectedItem = selectedId === 'draft'
    ? draftItem
    : selectedId
      ? allItems.find(item => item.id === selectedId) ?? null
      : null
  const openDetailItem = openDetailId ? itemsById.get(openDetailId) ?? null : null

  const canvasCenter = useCallback(() => ({
    x: (viewportSize.width / 2 - pan.x) / zoom,
    y: (viewportSize.height / 2 - pan.y) / zoom,
  }), [pan.x, pan.y, viewportSize.height, viewportSize.width, zoom])

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    }
  }, [pan.x, pan.y, zoom])

  const centerOn = useCallback((point: CanvasPoint, nextZoom = zoom) => {
    setPan({
      x: viewportSize.width / 2 - point.x * nextZoom,
      y: viewportSize.height / 2 - point.y * nextZoom,
    })
  }, [viewportSize.height, viewportSize.width, zoom])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const updateSize = () => {
      const rect = node.getBoundingClientRect()
      setViewportSize({ width: rect.width, height: rect.height })
      setPan(prev => (
        prev.x === 0 && prev.y === 0
          ? { x: rect.width / 2, y: rect.height / 2 }
          : prev
      ))
    }

    updateSize()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null
    observer?.observe(node)
    window.addEventListener('resize', updateSize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [])

  useEffect(() => {
    if (initialFitRef.current || viewportSize.width <= 1 || viewportSize.height <= 1) return
    const imageItems = localItems.filter(item => item.item_type === 'image')
    if (imageItems.length === 0) return

    const bounds = imageItems.reduce(
      (acc, item) => ({
        minX: Math.min(acc.minX, item.position_x),
        minY: Math.min(acc.minY, item.position_y),
        maxX: Math.max(acc.maxX, item.position_x + item.width),
        maxY: Math.max(acc.maxY, item.position_y + item.height),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      }
    )

    const boundsWidth = Math.max(bounds.maxX - bounds.minX, 1)
    const boundsHeight = Math.max(bounds.maxY - bounds.minY, 1)
    const paddedWidth = Math.max(viewportSize.width - 48, 1)
    const paddedHeight = Math.max(viewportSize.height - 48, 1)
    const nextZoom = clampZoom(Math.min(0.9, paddedWidth / boundsWidth, paddedHeight / boundsHeight))
    const center = {
      x: bounds.minX + boundsWidth / 2,
      y: bounds.minY + boundsHeight / 2,
    }

    setZoom(nextZoom)
    setPan({
      x: viewportSize.width / 2 - center.x * nextZoom,
      y: viewportSize.height / 2 - center.y * nextZoom,
    })
    initialFitRef.current = true
  }, [localItems, viewportSize.height, viewportSize.width])

  useEffect(() => {
    const center = canvasCenter()
    const timer = window.setTimeout(() => {
      void loadViewport({
        centerX: center.x,
        centerY: center.y,
        width: viewportSize.width,
        height: viewportSize.height,
        zoom,
      })
    }, 180)

    return () => window.clearTimeout(timer)
  }, [canvasCenter, loadViewport, viewportSize.height, viewportSize.width, zoom])

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const clearDraftSaveTimer = useCallback(() => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current)
      draftSaveTimerRef.current = null
    }
  }, [])

  const finishItemEditing = () => {
    clearLongPress()
    pointerRef.current = null
    pinchRef.current = null
    activePointersRef.current.clear()
    setEditingId(null)
  }

  const trackTouchPointer = (event: React.PointerEvent) => {
    if (event.pointerType !== 'touch') return
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  const releaseTouchPointer = (event: React.PointerEvent) => {
    if (event.pointerType !== 'touch') return
    activePointersRef.current.delete(event.pointerId)
  }

  const startPinchIfReady = () => {
    const entries = Array.from(activePointersRef.current.entries())
    const rect = containerRef.current?.getBoundingClientRect()
    if (entries.length < 2 || !rect) return false

    const [first, second] = entries.slice(-2)
    const midpoint = getPointMidpoint(first[1], second[1])
    const localMidpoint = {
      x: midpoint.x - rect.left,
      y: midpoint.y - rect.top,
    }
    const distance = Math.max(getPointDistance(first[1], second[1]), 1)

    clearLongPress()
    pointerRef.current = null
    pinchRef.current = {
      pointerIds: [first[0], second[0]],
      startDistance: distance,
      startZoom: zoom,
      worldAtMidpoint: {
        x: (localMidpoint.x - pan.x) / zoom,
        y: (localMidpoint.y - pan.y) / zoom,
      },
    }

    return true
  }

  const canEditItem = (item: ArtBoardItem | DraftItem | null | undefined) =>
    Boolean(item && profile?.id && item.user_id === profile.id)

  const canDeleteItem = (item: ArtBoardItem | DraftItem | null | undefined) =>
    Boolean(item && profile?.id && (item.user_id === profile.id || isOperator))

  const canManageLink = (link: ArtBoardLink) => {
    if (isOperator) return true
    if (!profile?.id) return false
    const a = itemsById.get(link.item_a_id)
    const b = itemsById.get(link.item_b_id)
    return a?.user_id === profile.id || b?.user_id === profile.id
  }

  const scheduleDraftSave = useCallback((item: DraftItem) => {
    clearDraftSaveTimer()

    draftSaveTimerRef.current = window.setTimeout(async () => {
      try {
        const { id: _id, chunk_x: _chunkX, chunk_y: _chunkY, created_at: _createdAt, updated_at: _updatedAt, user, ...draft } = item
        const saved = await createItem(draft)
        if (saved) {
          setDraftItem(null)
          setSelectedId(saved.id)
          setEditingId(null)
        }
      } catch (error) {
        showActionErrorToast(await normalizeError(error))
      } finally {
        draftSaveTimerRef.current = null
      }
    }, DRAFT_SAVE_DELAY_MS)
  }, [clearDraftSaveTimer, createItem])

  const commitItemUpdate = useCallback(async (item: ArtBoardItem, updates: UpdateArtBoardItemInput, rollback: ArtBoardItem) => {
    try {
      await updateItem(item.id, updates)
    } catch (error) {
      setLocalItems(prev => prev.map(existing => existing.id === rollback.id ? rollback : existing))
      showActionErrorToast(await normalizeError(error))
    }
  }, [updateItem])

  const updateLocalItem = (itemId: string, updater: (item: ArtBoardItem | DraftItem) => ArtBoardItem | DraftItem) => {
    if (itemId === 'draft') {
      setDraftItem(prev => prev ? updater(prev) as DraftItem : prev)
      return
    }
    setLocalItems(prev => prev.map(item => item.id === itemId ? updater(item) as ArtBoardItem : item))
  }

  const startItemEdit = (item: ArtBoardItem | DraftItem) => {
    if (!canEditItem(item)) return
    setSelectedId(item.id)
    setEditingId(item.id)
  }

  const handleItemAction = async (item: ArtBoardItem | DraftItem, action: 'edit' | 'foreground' | 'background' | 'link' | 'delete') => {
    if (action === 'edit') {
      if (item.id === 'draft') {
        setEditingId(editingId === 'draft' ? null : 'draft')
        return
      }
      setEditPanelItem(item as ArtBoardItem)
      return
    }

    if (action === 'link') {
      if (item.id === 'draft') {
        toast.error('Place the item before linking it.')
        return
      }
      setLinkSourceId(item.id)
      setPendingLinkTargetId(null)
      setOpenDetailId(null)
      toast('Tap another item to link')
      return
    }

    if (action === 'delete') {
      if (!canDeleteItem(item)) return
      const confirmed = window.confirm('Remove this Art Board item?')
      if (!confirmed) return
      if (item.id === 'draft') {
        clearDraftSaveTimer()
        setDraftItem(null)
        setSelectedId(null)
        return
      }
      try {
        await deleteItem(item.id)
        setSelectedId(null)
        setOpenDetailId(null)
      } catch (error) {
        showActionErrorToast(await normalizeError(error))
      }
      return
    }

    if (!canEditItem(item) || item.id === 'draft') return
    const rollback = item as ArtBoardItem
    const z_index = action === 'foreground' ? Date.now() : -Date.now()
    setLocalItems(prev => prev.map(existing => existing.id === item.id ? { ...existing, z_index } : existing))
    await commitItemUpdate(item as ArtBoardItem, { z_index }, rollback)
  }

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    trackTouchPointer(event)
    if (event.pointerType === 'touch') {
      capturePointerSafely(event.currentTarget, event.pointerId)
      if (startPinchIfReady()) return
    }

    if (!isPrimaryPointerButton(event)) return
    clearLongPress()
    pointerRef.current = {
      mode: 'pan',
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPan: pan,
    }
    capturePointerSafely(event.currentTarget, event.pointerId)
  }

  const handleItemPointerDown = (item: ArtBoardItem | DraftItem, event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    trackTouchPointer(event)
    if (event.pointerType === 'touch') {
      capturePointerSafely(event.currentTarget, event.pointerId)
      if (startPinchIfReady()) return
    }

    if (!isPrimaryPointerButton(event)) return

    if (linkSourceId && item.id !== linkSourceId && item.id !== 'draft') {
      setPendingLinkTargetId(item.id)
      return
    }

    const startItem = { ...item }
    pointerRef.current = {
      mode: editingId === item.id ? 'move' : 'pan',
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPan: pan,
      itemId: item.id,
      startItem,
    }
    capturePointerSafely(event.currentTarget, event.pointerId)

    clearLongPress()
    longPressTimerRef.current = window.setTimeout(() => {
      startItemEdit(item)
      pointerRef.current = {
        mode: 'move',
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        startPan: pan,
        itemId: item.id,
        startItem,
      }
    }, LONG_PRESS_MS)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' && activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }

    const pinch = pinchRef.current
    if (pinch) {
      const first = activePointersRef.current.get(pinch.pointerIds[0])
      const second = activePointersRef.current.get(pinch.pointerIds[1])
      const rect = containerRef.current?.getBoundingClientRect()
      if (!first || !second || !rect) return

      event.preventDefault()
      const distance = Math.max(getPointDistance(first, second), 1)
      const midpoint = getPointMidpoint(first, second)
      const nextZoom = clampZoom(pinch.startZoom * (distance / pinch.startDistance))
      setZoom(nextZoom)
      setPan({
        x: midpoint.x - rect.left - pinch.worldAtMidpoint.x * nextZoom,
        y: midpoint.y - rect.top - pinch.worldAtMidpoint.y * nextZoom,
      })
      return
    }

    const active = pointerRef.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = event.clientX - active.startClient.x
    const dy = event.clientY - active.startClient.y

    if (Math.abs(dx) + Math.abs(dy) > 7 && active.mode !== 'move') {
      clearLongPress()
    }

    if (active.mode === 'pan') {
      setPan({ x: active.startPan.x + dx, y: active.startPan.y + dy })
      return
    }

    if (!active.itemId || !active.startItem) return

    if (active.mode === 'move') {
      updateLocalItem(active.itemId, item => ({
        ...item,
        position_x: active.startItem!.position_x + dx / zoom,
        position_y: active.startItem!.position_y + dy / zoom,
      }))
      return
    }

  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current
    releaseTouchPointer(event)
    if (pinch?.pointerIds.includes(event.pointerId)) {
      clearLongPress()
      pinchRef.current = null
      pointerRef.current = null
      return
    }

    const active = pointerRef.current
    clearLongPress()
    if (!active || active.pointerId !== event.pointerId) return

    const moved = Math.abs(event.clientX - active.startClient.x) + Math.abs(event.clientY - active.startClient.y) > 7
    const itemId = active.itemId
    pointerRef.current = null

    if (itemId && active.mode === 'move') {
      const item = itemId === 'draft'
        ? draftItem
        : allItems.find(existing => existing.id === itemId)
      if (!item || !active.startItem) return

      if (item.id === 'draft') {
        scheduleDraftSave(item as DraftItem)
      } else {
        const rollback = active.startItem as ArtBoardItem
        void commitItemUpdate(item as ArtBoardItem, {
          position_x: item.position_x,
          position_y: item.position_y,
        }, rollback)
      }
      return
    }

    if (itemId && !moved) {
      if (selectedId === itemId && itemId !== 'draft') {
        setOpenDetailId(itemId)
      } else {
        setSelectedId(itemId)
      }
    }
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const nextZoom = clampZoom(zoom * (event.deltaY > 0 ? 0.92 : 1.08))
    const world = screenToWorld(event.clientX, event.clientY)
    setZoom(nextZoom)
    setPan({
      x: event.clientX - rect.left - world.x * nextZoom,
      y: event.clientY - rect.top - world.y * nextZoom,
    })
  }

  const createDraft = (input: Omit<CreateArtBoardItemInput, 'position_x' | 'position_y' | 'z_index'>) => {
    if (!profile) return
    const center = canvasCenter()
    const now = new Date().toISOString()
    const draft: DraftItem = {
      ...input,
      id: 'draft',
      user_id: profile.id,
      tags: input.tags ?? [],
      title: input.title ?? null,
      caption: input.caption ?? null,
      image_url: input.image_url ?? null,
      image_path: input.image_path ?? null,
      thumbnail_url: input.thumbnail_url ?? null,
      thumbnail_path: input.thumbnail_path ?? null,
      image_width: input.image_width ?? null,
      image_height: input.image_height ?? null,
      alt_text: input.alt_text ?? null,
      note_text: input.note_text ?? null,
      note_color: input.note_color ?? 'butter',
      frame_style: input.frame_style ?? 'clean',
      position_x: center.x - input.width / 2,
      position_y: center.y - input.height / 2,
      z_index: Date.now(),
      chunk_x: 0,
      chunk_y: 0,
      reactions: {},
      created_at: now,
      updated_at: now,
    }
    setDraftItem(draft)
    setSelectedId('draft')
    setEditingId('draft')
    scheduleDraftSave(draft)
  }

  const rotateSelected = async (delta: number) => {
    if (!selectedItem || !canEditItem(selectedItem)) return
    const next = clampArtBoardItem({ ...selectedItem, rotation: selectedItem.rotation + delta })
    if (selectedItem.id === 'draft') {
      const updated = { ...selectedItem, rotation: next.rotation } as DraftItem
      setDraftItem(updated)
      scheduleDraftSave(updated)
      return
    }
    const rollback = selectedItem as ArtBoardItem
    setLocalItems(prev => prev.map(item => item.id === selectedItem.id ? { ...item, rotation: next.rotation } : item))
    await commitItemUpdate(selectedItem as ArtBoardItem, { rotation: next.rotation }, rollback)
  }

  const jumpToItem = (item: ArtBoardItem) => {
    const center = getItemCenter(item)
    centerOn(center, Math.max(zoom, 0.85))
    setSelectedId(item.id)
    setOpenDetailId(null)
  }

  const reactToItem = async (itemId: string, reaction: ArtBoardReaction) => {
    if (itemId === 'draft') return
    try {
      await toggleReaction(itemId, reaction)
    } catch (error) {
      showActionErrorToast(await normalizeError(error))
    }
  }

  const linksForItem = (itemId: string) => links.filter(link => link.item_a_id === itemId || link.item_b_id === itemId)

  const visibleLinkLines = links
    .map(link => {
      const a = itemsById.get(link.item_a_id)
      const b = itemsById.get(link.item_b_id)
      if (!a || !b) return null
      const start = getItemCenter(a)
      const end = getItemCenter(b)
      const dx = end.x - start.x
      const dy = end.y - start.y
      const length = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx) * (180 / Math.PI)
      const active = selectedId === link.item_a_id || selectedId === link.item_b_id || openDetailId === link.item_a_id || openDetailId === link.item_b_id
      return { link, start, length, angle, active }
    })
    .filter(Boolean) as Array<{ link: ArtBoardLink; start: CanvasPoint; length: number; angle: number; active: boolean }>

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#17130f]">
      <div
        ref={containerRef}
        data-testid="art-board-canvas"
        className="relative min-h-0 flex-1 touch-none overflow-hidden bg-[radial-gradient(circle_at_center,rgba(215,170,70,0.10),transparent_30%),linear-gradient(135deg,rgba(55,42,27,0.45),rgba(10,9,8,0.92))]"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,240,184,0.72)_1px,transparent_0)] [background-size:18px_18px]" />
        <div
          data-testid="art-board-stage"
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {visibleLinkLines.map(({ link, start, length, angle, active }) => (
            <div
              key={link.id}
              className={cn('absolute h-px origin-left rounded-full transition-opacity', active ? 'bg-[rgba(245,214,132,0.78)] opacity-100' : 'bg-[rgba(210,190,150,0.25)] opacity-55')}
              style={{
                left: start.x,
                top: start.y,
                width: length,
                transform: `rotate(${angle}deg)`,
              }}
            >
              {active && (
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[calc(100%+0.25rem)] rounded-full border border-[rgba(215,170,70,0.22)] bg-[rgba(10,10,10,0.76)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-gold)]">
                  {link.label}
                </span>
              )}
            </div>
          ))}

          {allItems.map((item, index) => (
            <ArtBoardItemCard
              key={item.id}
              item={item}
              stackIndex={index + 1}
              selected={selectedId === item.id}
              editing={editingId === item.id}
              canEdit={canEditItem(item)}
              canDelete={canDeleteItem(item)}
              onPointerDown={event => handleItemPointerDown(item, event)}
              onSelectAction={action => void handleItemAction(item, action)}
              onDoneEditing={finishItemEditing}
              onReact={reaction => void reactToItem(item.id, reaction)}
            />
          ))}
        </div>

        <div
          className="absolute right-3 top-3 z-30 flex flex-col items-end gap-2"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setAddChooserOpen(value => !value)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.2),rgba(215,170,70,0.12))] text-[var(--text-gold)] shadow-[var(--shadow-gold-soft)]"
            aria-label="Add to Art Board"
          >
            <Plus className="h-5 w-5" />
          </button>
          {addChooserOpen && (
            <div className="glass-panel-strong grid w-44 gap-2 rounded-[var(--radius-md)] p-2">
              <button type="button" onClick={() => { setAddMode('image'); setAddChooserOpen(false) }} className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-white/5">
                <ImageIcon className="h-4 w-4 text-[var(--text-gold)]" />
                Image
              </button>
              <button type="button" onClick={() => { setAddMode('note'); setAddChooserOpen(false) }} className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-white/5">
                <StickyNote className="h-4 w-4 text-[var(--text-gold)]" />
                Sticky note
              </button>
            </div>
          )}
        </div>

        {selectedItem && canEditItem(selectedItem) && (
          <div
            className="absolute bottom-[calc(env(safe-area-inset-bottom)+5.15rem)] left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-[var(--border-panel)] bg-[rgba(10,11,12,0.88)] p-1 shadow-[var(--shadow-panel-strong)] backdrop-blur-xl md:bottom-4"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => startItemEdit(selectedItem)}
              className={cn(
                'rounded-full p-2 text-[var(--text-primary)] hover:bg-white/5',
                editingId === selectedItem.id && 'bg-white/5 text-[rgb(143,216,189)]'
              )}
              aria-label="Move item"
            >
              <Move className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => void rotateSelected(-2)} className="rounded-full p-2 text-[var(--text-primary)] hover:bg-white/5" aria-label="Rotate left">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => void rotateSelected(2)} className="rounded-full p-2 text-[var(--text-primary)] hover:bg-white/5" aria-label="Rotate right">
              <RotateCw className="h-4 w-4" />
            </button>
            {editingId === selectedItem.id && (
              <button type="button" onClick={finishItemEditing} className="rounded-full p-2 text-[var(--text-gold)] hover:bg-white/5" aria-label="Done">
                <Check className="h-4 w-4" />
              </button>
            )}
            {editingId === selectedItem.id && (
              <button type="button" onClick={finishItemEditing} className="rounded-full p-2 text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]" aria-label="Exit edit mode">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {linkSourceId && (
          <div
            className="absolute inset-x-3 top-16 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.32)] bg-[rgba(10,11,12,0.92)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-[var(--shadow-panel-strong)]"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
          >
            <span className="inline-flex items-center gap-2">
              <Link2 className="h-4 w-4 text-[var(--text-gold)]" />
              Tap an item to link
            </span>
            <button type="button" onClick={() => setLinkSourceId(null)} className="rounded-full p-1 text-[var(--text-muted)] hover:bg-white/5" aria-label="Cancel link mode">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {loading && allItems.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <LoadingSpinner size="lg" className="text-[var(--text-gold)]" />
          </div>
        )}

        {error && (
          <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-3 right-3 z-40 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.4)] bg-[rgba(87,14,28,0.84)] px-3 py-2 text-sm text-red-100 md:left-auto md:right-4 md:w-80">
            {error}
          </div>
        )}
      </div>

      <AddArtDialog mode={addMode} onClose={() => setAddMode(null)} onCreateDraft={createDraft} />

      {pendingLinkTargetId && linkSourceId && (
        <div className="fixed inset-0 z-[94] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="popup-surface w-full max-w-sm rounded-[var(--radius-lg)] p-4">
            <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">Link label</h2>
            <div className="grid gap-2">
              {ART_BOARD_LINK_LABELS.map(label => (
                <button
                  key={label}
                  type="button"
                  onClick={async () => {
                    try {
                      await createLink(linkSourceId, pendingLinkTargetId, label)
                      setLinkSourceId(null)
                      setPendingLinkTargetId(null)
                    } catch (error) {
                      showActionErrorToast(await normalizeError(error))
                    }
                  }}
                  className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:border-[var(--border-glow)]"
                >
                  {label}
                </button>
              ))}
            </div>
            <Button type="button" variant="ghost" className="mt-3 w-full justify-center" onClick={() => setPendingLinkTargetId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {openDetailItem && (
        <DetailDialog
          item={openDetailItem}
          links={linksForItem(openDetailItem.id)}
          itemsById={itemsById}
          canEdit={canEditItem(openDetailItem)}
          canDelete={canDeleteItem(openDetailItem)}
          canManageLink={canManageLink}
          onClose={() => setOpenDetailId(null)}
          onReact={reaction => void reactToItem(openDetailItem.id, reaction)}
          onAction={action => void handleItemAction(openDetailItem, action)}
          onJumpToItem={jumpToItem}
          onUpdateLink={(link, label) => {
            void updateLink(link.id, label).catch(async error => showActionErrorToast(await normalizeError(error)))
          }}
          onDeleteLink={(link) => {
            if (!window.confirm('Remove this Art Board link?')) return
            void deleteLink(link.id).catch(async error => showActionErrorToast(await normalizeError(error)))
          }}
        />
      )}

      {editPanelItem && (
        <EditPanel
          item={editPanelItem}
          onClose={() => setEditPanelItem(null)}
          onSave={(updates) => {
            const rollback = editPanelItem
            setLocalItems(prev => prev.map(item => item.id === rollback.id ? { ...item, ...updates } : item))
            void commitItemUpdate(rollback, updates, rollback)
          }}
        />
      )}

    </div>
  )
}
