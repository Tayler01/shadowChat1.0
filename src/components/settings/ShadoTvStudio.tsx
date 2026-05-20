import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Clapperboard, Eye, EyeOff, Film, Image, Plus, RotateCcw, Save, Trash2, Upload, Video } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  createShadoTvContentItem,
  createShadoTvChannel,
  createShadoTvVideo,
  fetchShadoTvAdminCatalog,
  restoreShadoTvContentItem,
  restoreShadoTvChannel,
  restoreShadoTvVideo,
  softDeleteShadoTvContentItem,
  softDeleteShadoTvVideo,
  updateShadoTvContentItemDetails,
  updateShadoTvContentItemVisibility,
  updateShadoTvChannelVisibility,
  updateShadoTvVideoArtwork,
  updateShadoTvVideoDetails,
  updateShadoTvVideoVisibility,
  uploadShadoTvVideoToBunny,
  type ShadoTvBunnyUploadKind,
  type ShadoTvContentItemUpdateValues,
  type ShadoTvVideoArtworkKind,
  type ShadoTvVideoUpdateValues,
} from '../../features/entertainment/shado-tv/api'
import type { ShadoTvChannel, ShadoTvContentItem, ShadoTvContentSection, ShadoTvVideo } from '../../features/entertainment/shado-tv/data'

type StudioTab = 'episodes' | ShadoTvContentSection

const DEFAULT_EPISODE_DRAFT = {
  title: 'The Chicken Snatchers',
  subtitle: 'Episode 1',
  description: 'The first Crimp & Shrimp caper sends the two small-time troublemakers into the woods with a bad plan, a nervous chicken, and more trouble than they bargained for.',
  durationMinutes: '30',
  releaseLabel: 'Premiere coming soon',
}

const toLocalDateTimeValue = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const makeEmptyEdit = (video?: ShadoTvVideo | null): ShadoTvVideoUpdateValues => ({
  title: video?.title ?? DEFAULT_EPISODE_DRAFT.title,
  subtitle: video?.subtitle ?? DEFAULT_EPISODE_DRAFT.subtitle,
  description: video?.description ?? DEFAULT_EPISODE_DRAFT.description,
  releaseStatus: video?.status ?? 'premiere',
  orientation: video?.orientation ?? 'horizontal',
  durationMinutes: video?.durationSeconds ? String(Math.round(video.durationSeconds / 60)) : DEFAULT_EPISODE_DRAFT.durationMinutes,
  releaseLabel: video?.releaseLabel ?? DEFAULT_EPISODE_DRAFT.releaseLabel,
  trailerReleaseAt: toLocalDateTimeValue(video?.trailerReleaseAt),
  premiereAt: toLocalDateTimeValue(video?.premiereAt),
  releasedAt: toLocalDateTimeValue(video?.releasedAt),
})

const makeEmptyContentEdit = (item?: ShadoTvContentItem | null): ShadoTvContentItemUpdateValues => ({
  title: item?.title ?? '',
  subtitle: item?.subtitle ?? '',
  body: item?.body ?? '',
  dateLabel: item?.dateLabel ?? '',
  sortOrder: String(item?.sortOrder ?? 10),
})

const getSectionLabel = (section: ShadoTvContentSection) => section === 'cast' ? 'Cast' : 'Updates'

export function ShadoTvStudio() {
  const [channels, setChannels] = useState<ShadoTvChannel[]>([])
  const [videos, setVideos] = useState<ShadoTvVideo[]>([])
  const [contentItems, setContentItems] = useState<ShadoTvContentItem[]>([])
  const [activeTab, setActiveTab] = useState<StudioTab>('episodes')
  const [selectedVideoId, setSelectedVideoId] = useState<string>('')
  const [selectedContentId, setSelectedContentId] = useState<string>('')
  const [editValues, setEditValues] = useState<ShadoTvVideoUpdateValues>(() => makeEmptyEdit())
  const [contentEditValues, setContentEditValues] = useState<ShadoTvContentItemUpdateValues>(() => makeEmptyContentEdit())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{
    videoId: string
    kind: ShadoTvBunnyUploadKind
    percentage: number
    label: string
  } | null>(null)

  const selectedVideo = useMemo(
    () => videos.find(video => video.id === selectedVideoId) ?? null,
    [selectedVideoId, videos]
  )
  const seriesChannel = channels.find(channel => !channel.deletedAt) ?? channels[0] ?? null
  const activeContentSection = activeTab === 'cast' || activeTab === 'updates' ? activeTab : null
  const contentItemsForTab = useMemo(
    () => activeContentSection
      ? contentItems
          .filter(item => item.section === activeContentSection && (!seriesChannel?.id || item.channelId === seriesChannel.id))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
      : [],
    [activeContentSection, contentItems, seriesChannel?.id]
  )
  const selectedContentItem = useMemo(
    () => contentItems.find(item => item.id === selectedContentId) ?? null,
    [contentItems, selectedContentId]
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const catalog = await fetchShadoTvAdminCatalog()
      setChannels(catalog.channels)
      setVideos(catalog.videos)
      setContentItems(catalog.contentItems)
      setSelectedVideoId(previous => {
        if (previous && catalog.videos.some(video => video.id === previous)) return previous
        return catalog.videos[0]?.id ?? ''
      })
      setSelectedContentId(previous => {
        if (previous && catalog.contentItems.some(item => item.id === previous)) return previous
        return catalog.contentItems[0]?.id ?? ''
      })
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load Shado TV Studio.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setEditValues(makeEmptyEdit(selectedVideo))
  }, [selectedVideo])

  useEffect(() => {
    if (!activeContentSection) return
    setSelectedContentId(previous => {
      if (previous && contentItemsForTab.some(item => item.id === previous)) return previous
      return contentItemsForTab[0]?.id ?? ''
    })
  }, [activeContentSection, contentItemsForTab])

  useEffect(() => {
    setContentEditValues(makeEmptyContentEdit(selectedContentItem))
  }, [selectedContentItem])

  const runAction = async (key: string, action: () => Promise<void>, success: string) => {
    setSaving(key)
    setMessage(null)
    setError(null)
    try {
      await action()
      await refresh()
      setMessage(success)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Shado TV Studio action failed.')
    } finally {
      setSaving(null)
    }
  }

  const ensureSeriesChannel = async () => {
    if (seriesChannel?.id) return seriesChannel.id
    await createShadoTvChannel({
      title: 'The Crimp & Shrimp Show',
      tagline: 'Small thieves. Big trouble. Family comedy from the woods.',
      description: 'The canonical Shado TV series channel for launch.',
      visibilityStatus: 'published',
    })
    const catalog = await fetchShadoTvAdminCatalog()
    const createdChannel = catalog.channels.find(channel => !channel.deletedAt)
    if (!createdChannel) throw new Error('Series channel was not created.')
    setChannels(catalog.channels)
    setVideos(catalog.videos)
    return createdChannel.id
  }

  const createEpisode = () => runAction(
    'create-episode',
    async () => {
      const channelId = await ensureSeriesChannel()
      await createShadoTvVideo({
        channelId,
        title: DEFAULT_EPISODE_DRAFT.title,
        subtitle: DEFAULT_EPISODE_DRAFT.subtitle,
        description: DEFAULT_EPISODE_DRAFT.description,
        sourceType: 'native_upload',
        releaseStatus: 'premiere',
        orientation: 'horizontal',
        durationMinutes: DEFAULT_EPISODE_DRAFT.durationMinutes,
        releaseLabel: DEFAULT_EPISODE_DRAFT.releaseLabel,
        externalUrl: '',
        embedUrl: '',
        visibilityStatus: 'hidden',
      })
    },
    'Episode draft created.'
  )

  const createContentItem = (section: ShadoTvContentSection) => runAction(
    `create-content-${section}`,
    async () => {
      const channelId = await ensureSeriesChannel()
      const existingCount = contentItems.filter(item => item.section === section && item.channelId === channelId).length
      await createShadoTvContentItem({
        channelId,
        section,
        title: section === 'cast' ? 'New Cast Member' : 'New Update',
        subtitle: section === 'cast' ? 'Role' : 'Studio note',
        body: '',
        dateLabel: section === 'updates' ? new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '',
        sortOrder: String((existingCount + 1) * 10),
        visibilityStatus: 'hidden',
      })
    },
    `${getSectionLabel(section)} draft created.`
  )

  const saveEpisode = () => {
    if (!selectedVideo) return
    void runAction(
      `save-${selectedVideo.id}`,
      () => updateShadoTvVideoDetails(selectedVideo.id, editValues),
      'Episode details saved.'
    )
  }

  const saveContentItem = () => {
    if (!selectedContentItem) return
    void runAction(
      `save-content-${selectedContentItem.id}`,
      () => updateShadoTvContentItemDetails(selectedContentItem.id, contentEditValues),
      `${getSectionLabel(selectedContentItem.section)} item saved.`
    )
  }

  const uploadArtwork = (videoId: string, kind: ShadoTvVideoArtworkKind, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void runAction(
      `artwork-${kind}-${videoId}`,
      () => updateShadoTvVideoArtwork(videoId, kind, file),
      kind === 'poster' ? 'Episode cover updated.' : 'Episode thumbnail updated.'
    )
  }

  const uploadBunnyVideo = (videoId: string, kind: ShadoTvBunnyUploadKind, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setError('Choose a video file.')
      return
    }

    const label = kind === 'episode' ? 'Episode video' : 'Trailer video'
    void runAction(
      `bunny-${kind}-${videoId}`,
      async () => {
        setUploadProgress({ videoId, kind, percentage: 0, label })
        try {
          await uploadShadoTvVideoToBunny(videoId, kind, file, progress => {
            setUploadProgress({
              videoId,
              kind,
              percentage: progress.percentage,
              label: `${label} ${progress.percentage}%`,
            })
          })
        } finally {
          setUploadProgress(null)
        }
      },
      `${label} uploaded to Bunny and queued for processing.`
    )
  }

  const setEditField = <K extends keyof ShadoTvVideoUpdateValues>(key: K, value: ShadoTvVideoUpdateValues[K]) => {
    setEditValues(previous => ({ ...previous, [key]: value }))
  }

  const setContentEditField = <K extends keyof ShadoTvContentItemUpdateValues>(key: K, value: ShadoTvContentItemUpdateValues[K]) => {
    setContentEditValues(previous => ({ ...previous, [key]: value }))
  }

  const renderContentEditor = (section: ShadoTvContentSection) => {
    const label = getSectionLabel(section)

    return (
      <div className="mt-5 grid gap-4 xl:grid-cols-[18rem_1fr]">
        <aside className="space-y-3">
          <div className="space-y-2">
            {contentItemsForTab.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
                No {label.toLowerCase()} items yet.
              </div>
            ) : (
              contentItemsForTab.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedContentId(item.id)}
                  className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition ${
                    selectedContentId === item.id
                      ? 'border-[var(--border-glow)] bg-[rgba(215,170,70,0.08)]'
                      : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--border-glow)]'
                  }`}
                >
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{item.title}</span>
                  <span className="mt-1 block truncate text-xs text-[var(--text-muted)]">
                    {item.deletedAt ? 'Deleted' : `${item.visibilityStatus} / order ${item.sortOrder}`}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="min-w-0">
          {!selectedContentItem ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
              Select or create a {label.toLowerCase()} item to edit.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 md:grid-cols-[1fr_10rem]">
                <label>
                  <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Title</span>
                  <input value={contentEditValues.title} onChange={event => setContentEditField('title', event.target.value)} className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                </label>
                <label>
                  <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Sort</span>
                  <input value={contentEditValues.sortOrder} onChange={event => setContentEditField('sortOrder', event.target.value)} inputMode="numeric" className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                </label>
                <label>
                  <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">{section === 'cast' ? 'Role / credit' : 'Subtitle'}</span>
                  <input value={contentEditValues.subtitle} onChange={event => setContentEditField('subtitle', event.target.value)} className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                </label>
                <label>
                  <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Date label</span>
                  <input value={contentEditValues.dateLabel} onChange={event => setContentEditField('dateLabel', event.target.value)} className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm" disabled={section === 'cast'} />
                </label>
                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Body</span>
                  <textarea value={contentEditValues.body} onChange={event => setContentEditField('body', event.target.value)} rows={5} className="obsidian-input w-full resize-none rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={saveContentItem} disabled={Boolean(saving) || Boolean(selectedContentItem.deletedAt)}>
                  <Save className="mr-2 h-4 w-4" />
                  Save {label}
                </Button>
                {selectedContentItem.deletedAt ? (
                  <Button type="button" variant="secondary" disabled={Boolean(saving)} onClick={() => void runAction(`restore-content-${selectedContentItem.id}`, () => restoreShadoTvContentItem(selectedContentItem.id), `${label} item restored as hidden.`)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restore
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="secondary" disabled={Boolean(saving)} onClick={() => void runAction(
                      `content-visibility-${selectedContentItem.id}`,
                      () => updateShadoTvContentItemVisibility(selectedContentItem.id, selectedContentItem.visibilityStatus === 'published' ? 'hidden' : 'published'),
                      `${label} visibility updated.`
                    )}>
                      {selectedContentItem.visibilityStatus === 'published' ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                      {selectedContentItem.visibilityStatus === 'published' ? 'Hide' : 'Publish'}
                    </Button>
                    <Button type="button" variant="danger" disabled={Boolean(saving)} onClick={() => void runAction(`delete-content-${selectedContentItem.id}`, () => softDeleteShadoTvContentItem(selectedContentItem.id), `${label} item deleted.`)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Clapperboard className="h-5 w-5 text-[var(--text-muted)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Shado TV Studio</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Manage Crimp & Shrimp episodes, trailers, launch dates, visibility, covers, and Bunny uploads.
          </p>
        </div>
        {activeTab === 'episodes' ? (
          <Button type="button" onClick={() => void createEpisode()} disabled={Boolean(saving)} className="w-full justify-center sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Add Episode
          </Button>
        ) : activeContentSection ? (
          <Button type="button" onClick={() => void createContentItem(activeContentSection)} disabled={Boolean(saving)} className="w-full justify-center sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Add {getSectionLabel(activeContentSection)}
          </Button>
        ) : null}
      </div>

      {message && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.24)] bg-[rgba(215,170,70,0.08)] p-3 text-sm text-[var(--text-gold)]">
          {message}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {([
          ['episodes', 'Episodes'],
          ['cast', 'Cast'],
          ['updates', 'Updates'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-[var(--radius-sm)] border px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-[var(--border-glow)] bg-[rgba(215,170,70,0.12)] text-[var(--text-gold)]'
                : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
          Loading Shado TV Studio.
        </div>
      ) : activeTab === 'episodes' ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[18rem_1fr]">
          <aside className="space-y-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Series channel</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-[var(--text-primary)]">
                  {seriesChannel?.name ?? 'Not created'}
                </span>
                {seriesChannel && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={Boolean(saving) || Boolean(seriesChannel.deletedAt)}
                    onClick={() => void runAction(
                      `channel-${seriesChannel.id}`,
                      () => updateShadoTvChannelVisibility(seriesChannel.id, seriesChannel.visibilityStatus === 'published' ? 'hidden' : 'published'),
                      'Series visibility updated.'
                    )}
                  >
                    {seriesChannel.visibilityStatus === 'published' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              {seriesChannel?.deletedAt && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-3 w-full justify-center"
                  disabled={Boolean(saving)}
                  onClick={() => void runAction(`restore-channel-${seriesChannel.id}`, () => restoreShadoTvChannel(seriesChannel.id), 'Series channel restored.')}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restore Series
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {videos.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
                  No episodes yet.
                </div>
              ) : (
                videos.map(video => (
                  <button
                    key={video.id}
                    type="button"
                    onClick={() => setSelectedVideoId(video.id)}
                    className={`grid w-full grid-cols-[3.5rem_1fr] gap-3 rounded-[var(--radius-md)] border p-3 text-left transition ${
                      selectedVideoId === video.id
                        ? 'border-[var(--border-glow)] bg-[rgba(215,170,70,0.08)]'
                        : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--border-glow)]'
                    }`}
                  >
                    <img src={video.posterAsset} alt="" className="h-16 w-12 rounded-[var(--radius-sm)] object-cover" loading="lazy" decoding="async" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{video.title}</span>
                      <span className="mt-1 block truncate text-xs text-[var(--text-muted)]">
                        {video.deletedAt ? 'Deleted' : `${video.visibilityStatus} / ${video.status} / ${video.uploadStatus ?? 'none'}`}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="min-w-0">
            {!selectedVideo ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
                Select or create an episode to edit.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 lg:grid-cols-[10rem_1fr]">
                  <img src={selectedVideo.posterAsset} alt="" className="h-56 w-full rounded-[var(--radius-md)] object-cover lg:h-full" loading="lazy" decoding="async" />
                  <div className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label>
                        <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Episode title</span>
                        <input value={editValues.title} onChange={event => setEditField('title', event.target.value)} className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                      </label>
                      <label>
                        <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Episode label</span>
                        <input value={editValues.subtitle} onChange={event => setEditField('subtitle', event.target.value)} className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                      </label>
                    </div>
                    <label>
                      <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Description</span>
                      <textarea value={editValues.description} onChange={event => setEditField('description', event.target.value)} rows={4} className="obsidian-input w-full resize-none rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                    </label>
                  </div>
                </div>

                <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 md:grid-cols-2 xl:grid-cols-4">
                  <label>
                    <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Release state</span>
                    <select value={editValues.releaseStatus} onChange={event => setEditField('releaseStatus', event.target.value as ShadoTvVideoUpdateValues['releaseStatus'])} className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm">
                      <option value="locked">Locked</option>
                      <option value="premiere">Premiere</option>
                      <option value="released">Released</option>
                      <option value="processing">Processing</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Orientation</span>
                    <select value={editValues.orientation} onChange={event => setEditField('orientation', event.target.value as ShadoTvVideoUpdateValues['orientation'])} className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm">
                      <option value="horizontal">Horizontal</option>
                      <option value="vertical">Vertical</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Minutes</span>
                    <input value={editValues.durationMinutes} onChange={event => setEditField('durationMinutes', event.target.value)} inputMode="decimal" className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Release label</span>
                    <input value={editValues.releaseLabel} onChange={event => setEditField('releaseLabel', event.target.value)} className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                  </label>
                </div>

                <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 md:grid-cols-3">
                  <label>
                    <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Trailer release</span>
                    <input type="datetime-local" value={editValues.trailerReleaseAt} onChange={event => setEditField('trailerReleaseAt', event.target.value)} className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Premiere starts</span>
                    <input type="datetime-local" value={editValues.premiereAt} onChange={event => setEditField('premiereAt', event.target.value)} className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Now streaming</span>
                    <input type="datetime-local" value={editValues.releasedAt} onChange={event => setEditField('releasedAt', event.target.value)} className="obsidian-input w-full rounded-[var(--radius-md)] px-3.5 py-3 text-sm" />
                  </label>
                </div>

                <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Bunny video pipeline</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                      Episode upload: {selectedVideo.uploadStatus ?? 'none'}
                      {selectedVideo.provider === 'bunny_stream' ? ' / Bunny linked' : ' / no episode stream linked'}
                      {selectedVideo.trailerAssetUrl ? ' / trailer linked' : ' / no trailer linked'}
                    </p>
                    {uploadProgress?.videoId === selectedVideo.id && (
                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-muted)]">
                          <span>{uploadProgress.label}</span>
                          <span>{uploadProgress.percentage}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                          <div className="h-full rounded-full bg-[var(--text-gold)] transition-[width]" style={{ width: `${uploadProgress.percentage}%` }} />
                        </div>
                      </div>
                    )}
                    {(selectedVideo.embedUrl || selectedVideo.trailerAssetUrl) && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {selectedVideo.embedUrl && (
                          <a href={selectedVideo.embedUrl} target="_blank" rel="noreferrer" className="text-[var(--text-gold)] underline-offset-4 hover:underline">
                            Open episode embed
                          </a>
                        )}
                        {selectedVideo.trailerAssetUrl && (
                          <a href={selectedVideo.trailerAssetUrl} target="_blank" rel="noreferrer" className="text-[var(--text-gold)] underline-offset-4 hover:underline">
                            Open trailer embed
                          </a>
                        )}
                      </div>
                    )}
                    {selectedVideo.uploadError && (
                      <p className="mt-2 text-xs text-red-200">{selectedVideo.uploadError}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]">
                      <Video className="mr-2 h-4 w-4" />
                      Episode Video
                      <input type="file" accept="video/mp4,video/webm,video/quicktime,video/*" className="sr-only" disabled={Boolean(saving) || Boolean(selectedVideo.deletedAt)} onChange={event => uploadBunnyVideo(selectedVideo.id, 'episode', event)} />
                    </label>
                    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]">
                      <Film className="mr-2 h-4 w-4" />
                      Trailer Video
                      <input type="file" accept="video/mp4,video/webm,video/quicktime,video/*" className="sr-only" disabled={Boolean(saving) || Boolean(selectedVideo.deletedAt)} onChange={event => uploadBunnyVideo(selectedVideo.id, 'trailer', event)} />
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={saveEpisode} disabled={Boolean(saving) || Boolean(selectedVideo.deletedAt)}>
                    <Save className="mr-2 h-4 w-4" />
                    Save Episode
                  </Button>
                  <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]">
                    <Image className="mr-2 h-4 w-4" />
                    Cover
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={Boolean(saving) || Boolean(selectedVideo.deletedAt)} onChange={event => uploadArtwork(selectedVideo.id, 'poster', event)} />
                  </label>
                  <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]">
                    <Upload className="mr-2 h-4 w-4" />
                    Thumbnail
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={Boolean(saving) || Boolean(selectedVideo.deletedAt)} onChange={event => uploadArtwork(selectedVideo.id, 'thumbnail', event)} />
                  </label>
                  {selectedVideo.deletedAt ? (
                    <Button type="button" variant="secondary" disabled={Boolean(saving)} onClick={() => void runAction(`restore-${selectedVideo.id}`, () => restoreShadoTvVideo(selectedVideo.id), 'Episode restored as hidden.')}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restore
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="secondary" disabled={Boolean(saving)} onClick={() => void runAction(`visibility-${selectedVideo.id}`, () => updateShadoTvVideoVisibility(selectedVideo.id, selectedVideo.visibilityStatus === 'published' ? 'hidden' : 'published'), 'Episode visibility updated.')}>
                        {selectedVideo.visibilityStatus === 'published' ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                        {selectedVideo.visibilityStatus === 'published' ? 'Hide' : 'Publish'}
                      </Button>
                      <Button type="button" variant="danger" disabled={Boolean(saving)} onClick={() => void runAction(`delete-${selectedVideo.id}`, () => softDeleteShadoTvVideo(selectedVideo.id), 'Episode deleted.')}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : activeContentSection ? (
        renderContentEditor(activeContentSection)
      ) : null}
    </div>
  )
}
