import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { BookOpen, Eye, EyeOff, ImagePlus, Plus, RefreshCw, Save, Send, Trash2, Upload } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  createShadowMysteryChapter,
  createShadowMysterySource,
  createShadowMysteryStory,
  deleteShadowMysteryArtwork,
  deleteShadowMysteryChapter,
  deleteShadowMysterySource,
  deleteShadowMysteryStory,
  fetchShadowMysteryAdminStories,
  paragraphsFromShadowMysteryDraft,
  setShadowMysteryPublicationStatus,
  slugifyShadowMysteryValue,
  updateShadowMysteryArtworkMetadata,
  updateShadowMysteryChapter,
  updateShadowMysterySource,
  updateShadowMysteryStory,
  uploadShadowMysteryArtwork,
  type ShadowMysteryAdminChapter,
  type ShadowMysteryAdminSource,
  type ShadowMysteryAdminStory,
  type ShadowMysteryArtwork,
  type ShadowMysteryArtworkRole,
  type ShadowMysteryStoryValues,
} from '../../features/entertainment/shadow-mystery/api'

type StudioAction = (key: string, action: () => Promise<void>, success: string) => void

const fieldClass = 'w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-glow)] focus:ring-2 focus:ring-[var(--theme-focus-ring)]'
const labelClass = 'grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]'
const today = () => new Date().toISOString().slice(0, 10)

const emptyStoryValues = (story?: ShadowMysteryAdminStory | null): ShadowMysteryStoryValues => ({
  slug: story?.slug ?? '',
  title: story?.title ?? '',
  subtitle: story?.subtitle ?? '',
  locationLabel: story?.locationLabel ?? '',
  deck: story?.deck ?? '',
  readTimeMinutes: story?.readTimeMinutes ?? 10,
  publishedAt: story?.publishedAt || today(),
  legacyStoryId: story?.legacyStoryId ?? null,
})

function ArtworkEditor({
  storyId,
  chapterId,
  role,
  artwork,
  saving,
  runAction,
}: {
  storyId: string
  chapterId?: string
  role: ShadowMysteryArtworkRole
  artwork?: ShadowMysteryArtwork
  saving: boolean
  runAction: StudioAction
}) {
  const [file, setFile] = useState<File | null>(null)
  const [alt, setAlt] = useState(artwork?.alt ?? '')
  const [caption, setCaption] = useState(artwork?.caption ?? '')
  const [sourceLabel, setSourceLabel] = useState(artwork?.sourceLabel ?? '')
  const [sourceUrl, setSourceUrl] = useState(artwork?.sourceUrl ?? '')
  const [credit, setCredit] = useState(artwork?.credit ?? '')
  const [license, setLicense] = useState(artwork?.license ?? '')

  useEffect(() => {
    setFile(null)
    setAlt(artwork?.alt ?? '')
    setCaption(artwork?.caption ?? '')
    setSourceLabel(artwork?.sourceLabel ?? '')
    setSourceUrl(artwork?.sourceUrl ?? '')
    setCredit(artwork?.credit ?? '')
    setLicense(artwork?.license ?? '')
  }, [artwork])

  const values = {
    storyId,
    chapterId: chapterId ?? null,
    role,
    alt,
    caption,
    sourceLabel,
    sourceUrl,
    credit,
    license,
    sortOrder: artwork?.sortOrder ?? 0,
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null)
  }

  const upload = () => {
    if (!file) return
    runAction(
      `artwork-${role}-${chapterId ?? storyId}`,
      () => uploadShadowMysteryArtwork(file, values),
      `${role === 'chapter' ? 'Chapter' : role === 'cover' ? 'Cover' : 'Header'} artwork saved.`
    )
  }

  const saveCredits = () => {
    if (!artwork) return
    runAction(
      `credits-${artwork.id}`,
      () => updateShadowMysteryArtworkMetadata(artwork.id, values),
      'Artwork description and credits saved.'
    )
  }

  const remove = () => {
    if (!artwork || !window.confirm('Remove this artwork from the story?')) return
    runAction(
      `delete-artwork-${artwork.id}`,
      () => deleteShadowMysteryArtwork(artwork.id, artwork.storagePath),
      'Artwork removed.'
    )
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold capitalize text-[var(--text-primary)]">{role} artwork</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Private JPG, PNG, or WebP. Signed phone-sized delivery.</p>
        </div>
        {artwork && <span className="rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-gold)]">Ready</span>}
      </div>

      {artwork && (
        <img
          src={artwork.asset}
          alt={artwork.alt}
          className="mt-3 max-h-56 w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] object-cover"
          loading="lazy"
        />
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Alt text
          <input className={fieldClass} value={alt} onChange={event => setAlt(event.target.value)} maxLength={300} />
        </label>
        <label className={labelClass}>
          Credit
          <input className={fieldClass} value={credit} onChange={event => setCredit(event.target.value)} maxLength={240} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Caption
          <textarea className={`${fieldClass} min-h-20 resize-y`} value={caption} onChange={event => setCaption(event.target.value)} maxLength={2000} />
        </label>
        <label className={labelClass}>
          Source label
          <input className={fieldClass} value={sourceLabel} onChange={event => setSourceLabel(event.target.value)} maxLength={240} />
        </label>
        <label className={labelClass}>
          Source URL (HTTPS)
          <input className={fieldClass} value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} inputMode="url" />
        </label>
        <label className={labelClass}>
          License
          <input className={fieldClass} value={license} onChange={event => setLicense(event.target.value)} maxLength={160} />
        </label>
        <label className={labelClass}>
          Image file
          <input className={`${fieldClass} file:mr-3 file:rounded file:border-0 file:bg-[var(--theme-accent-soft)] file:px-2 file:py-1 file:text-[var(--text-primary)]`} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={upload} disabled={!file || saving}>
          <Upload className="mr-2 h-4 w-4" />
          {artwork ? 'Replace image' : 'Upload image'}
        </Button>
        {artwork && (
          <>
            <Button type="button" size="sm" variant="secondary" onClick={saveCredits} disabled={saving}>
              <Save className="mr-2 h-4 w-4" /> Save credits
            </Button>
            <Button type="button" size="sm" variant="danger" onClick={remove} disabled={saving} aria-label={`Remove ${role} artwork`}>
              <Trash2 className="mr-2 h-4 w-4" /> Remove
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function ChapterEditor({ chapter, saving, runAction }: {
  chapter: ShadowMysteryAdminChapter
  saving: boolean
  runAction: StudioAction
}) {
  const [chapterKey, setChapterKey] = useState(chapter.chapterKey)
  const [title, setTitle] = useState(chapter.title)
  const [kicker, setKicker] = useState(chapter.kicker ?? '')
  const [body, setBody] = useState(chapter.body.join('\n\n'))
  const [sortOrder, setSortOrder] = useState(String(chapter.sortOrder))

  useEffect(() => {
    setChapterKey(chapter.chapterKey)
    setTitle(chapter.title)
    setKicker(chapter.kicker ?? '')
    setBody(chapter.body.join('\n\n'))
    setSortOrder(String(chapter.sortOrder))
  }, [chapter])

  const save = () => runAction(
    `chapter-${chapter.id}`,
    () => updateShadowMysteryChapter(chapter.id, {
      chapterKey,
      title,
      kicker,
      body: paragraphsFromShadowMysteryDraft(body),
      sortOrder: Number(sortOrder),
    }),
    'Chapter saved.'
  )

  const remove = () => {
    if (!window.confirm(`Delete “${chapter.title}” and its artwork?`)) return
    runAction(`delete-chapter-${chapter.id}`, () => deleteShadowMysteryChapter(chapter.id), 'Chapter deleted.')
  }

  return (
    <details className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)]" open>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
        {chapter.sortOrder}. {chapter.title}
      </summary>
      <div className="grid gap-4 border-t border-[var(--border-subtle)] p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <label className={labelClass}>Chapter title<input className={fieldClass} value={title} onChange={event => setTitle(event.target.value)} maxLength={180} /></label>
          <label className={labelClass}>Order<input className={fieldClass} type="number" min={0} max={100000} value={sortOrder} onChange={event => setSortOrder(event.target.value)} /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>Chapter key<input className={fieldClass} value={chapterKey} onChange={event => setChapterKey(event.target.value)} maxLength={90} /></label>
          <label className={labelClass}>Kicker<input className={fieldClass} value={kicker} onChange={event => setKicker(event.target.value)} maxLength={160} /></label>
        </div>
        <label className={labelClass}>
          Story text (blank line between paragraphs)
          <textarea className={`${fieldClass} min-h-72 resize-y font-serif leading-7 normal-case tracking-normal`} value={body} onChange={event => setBody(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />Save chapter</Button>
          <Button type="button" size="sm" variant="danger" onClick={remove} disabled={saving}><Trash2 className="mr-2 h-4 w-4" />Delete chapter</Button>
        </div>
        <ArtworkEditor
          storyId={chapter.storyId}
          chapterId={chapter.id}
          role="chapter"
          artwork={chapter.image}
          saving={saving}
          runAction={runAction}
        />
      </div>
    </details>
  )
}

function SourceEditor({ source, saving, runAction }: {
  source: ShadowMysteryAdminSource
  saving: boolean
  runAction: StudioAction
}) {
  const [label, setLabel] = useState(source.label)
  const [url, setUrl] = useState(source.url)
  const [usage, setUsage] = useState(source.usage)
  const [sortOrder, setSortOrder] = useState(String(source.sortOrder))

  useEffect(() => {
    setLabel(source.label)
    setUrl(source.url)
    setUsage(source.usage)
    setSortOrder(String(source.sortOrder))
  }, [source])

  const save = () => runAction(
    `source-${source.id}`,
    () => updateShadowMysterySource(source.id, { label, url, usage, sortOrder: Number(sortOrder) }),
    'Source saved.'
  )
  const remove = () => {
    if (!window.confirm(`Delete source “${source.label}”?`)) return
    runAction(`delete-source-${source.id}`, () => deleteShadowMysterySource(source.id), 'Source deleted.')
  }

  return (
    <div className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <label className={labelClass}>Source label<input className={fieldClass} value={label} onChange={event => setLabel(event.target.value)} /></label>
        <label className={labelClass}>Order<input className={fieldClass} type="number" min={0} max={100000} value={sortOrder} onChange={event => setSortOrder(event.target.value)} /></label>
      </div>
      <label className={labelClass}>HTTPS URL<input className={fieldClass} value={url} onChange={event => setUrl(event.target.value)} inputMode="url" /></label>
      <label className={labelClass}>How it was used<textarea className={`${fieldClass} min-h-20 resize-y`} value={usage} onChange={event => setUsage(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />Save source</Button>
        <Button type="button" size="sm" variant="danger" onClick={remove} disabled={saving}><Trash2 className="mr-2 h-4 w-4" />Delete source</Button>
      </div>
    </div>
  )
}

export function ShadowMysteryStudio() {
  const [stories, setStories] = useState<ShadowMysteryAdminStory[]>([])
  const [selectedStoryId, setSelectedStoryId] = useState('')
  const [storyValues, setStoryValues] = useState<ShadowMysteryStoryValues>(emptyStoryValues())
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [newSource, setNewSource] = useState({ label: '', url: '', usage: '', sortOrder: '10' })

  const selectedStory = useMemo(
    () => stories.find(story => story.id === selectedStoryId) ?? null,
    [selectedStoryId, stories]
  )

  const refresh = useCallback(async (preferredStoryId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const nextStories = await fetchShadowMysteryAdminStories()
      setStories(nextStories)
      setSelectedStoryId(previous => {
        const preferred = preferredStoryId || previous
        return preferred && nextStories.some(story => story.id === preferred)
          ? preferred
          : nextStories[0]?.id ?? ''
      })
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load Shadow Mystery Studio.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    setStoryValues(emptyStoryValues(selectedStory))
  }, [selectedStory])

  const runAction: StudioAction = (key, action, success) => {
    setSavingKey(key)
    setError(null)
    setMessage(null)
    void action()
      .then(() => refresh(selectedStoryId))
      .then(() => setMessage(success))
      .catch(actionError => setError(actionError instanceof Error ? actionError.message : 'Studio action failed.'))
      .finally(() => setSavingKey(null))
  }

  const createStory = () => {
    const timestamp = Date.now()
    const values: ShadowMysteryStoryValues = {
      slug: `untitled-case-${timestamp}`,
      title: 'Untitled Case',
      subtitle: 'A Shadow Mystery draft',
      locationLabel: 'Case archive',
      deck: 'Write the short case deck that appears in the story list.',
      readTimeMinutes: 10,
      publishedAt: today(),
    }
    setSavingKey('create-story')
    setError(null)
    setMessage(null)
    void createShadowMysteryStory(values)
      .then(created => refresh(created.id))
      .then(() => setMessage('Story draft created.'))
      .catch(actionError => setError(actionError instanceof Error ? actionError.message : 'Unable to create story.'))
      .finally(() => setSavingKey(null))
  }

  const saveStory = () => {
    if (!selectedStory) return
    runAction('save-story', () => updateShadowMysteryStory(selectedStory.id, storyValues), 'Story details saved.')
  }

  const publishStory = () => {
    if (!selectedStory) return
    runAction('publish-story', async () => {
      await updateShadowMysteryStory(selectedStory.id, storyValues)
      await setShadowMysteryPublicationStatus(selectedStory.id, 'published', storyValues.publishedAt)
    }, 'Story published to Shadow Mystery.')
  }

  const moveToDraft = () => {
    if (!selectedStory) return
    runAction('draft-story', () => setShadowMysteryPublicationStatus(selectedStory.id, 'draft'), 'Story moved back to draft.')
  }

  const removeStory = () => {
    if (!selectedStory || !window.confirm(`Delete “${selectedStory.title}”, every chapter, and its artwork?`)) return
    runAction('delete-story', () => deleteShadowMysteryStory(selectedStory.id), 'Story deleted.')
  }

  const addChapter = () => {
    if (!selectedStory) return
    const nextOrder = Math.max(0, ...selectedStory.chapters.map(chapter => chapter.sortOrder)) + 10
    runAction('add-chapter', () => createShadowMysteryChapter(selectedStory.id, {
      chapterKey: `chapter-${Date.now()}`,
      title: 'Untitled Chapter',
      kicker: '',
      body: ['Begin this chapter here.'],
      sortOrder: nextOrder,
    }).then(() => undefined), 'Chapter draft added.')
  }

  const addSource = () => {
    if (!selectedStory) return
    runAction('add-source', async () => {
      await createShadowMysterySource(selectedStory.id, {
        label: newSource.label,
        url: newSource.url,
        usage: newSource.usage,
        sortOrder: Number(newSource.sortOrder),
      })
      setNewSource({ label: '', url: '', usage: '', sortOrder: String(Number(newSource.sortOrder) + 10) })
    }, 'Source added.')
  }

  const setStoryField = <Key extends keyof ShadowMysteryStoryValues>(key: Key, value: ShadowMysteryStoryValues[Key]) => {
    setStoryValues(previous => ({ ...previous, [key]: value }))
  }

  return (
    <div className="space-y-5" aria-label="Shadow Mystery publishing studio">
      <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[var(--text-gold)]"><BookOpen className="h-5 w-5" /><p className="text-xs font-semibold uppercase tracking-[0.16em]">Publishing studio</p></div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Shadow Mystery</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">Create longform cases, order chapters, preserve source credits, and publish private transformed artwork. Drafts remain operator-only; the four bundled V1 stories remain available as reader fallbacks.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void refresh(selectedStoryId)} disabled={loading || Boolean(savingKey)}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
            <Button type="button" size="sm" onClick={createStory} disabled={Boolean(savingKey)}><Plus className="mr-2 h-4 w-4" />New story</Button>
          </div>
        </div>

        {error && <div role="alert" className="mt-4 rounded-[var(--radius-sm)] border border-red-400/30 bg-red-950/30 px-3 py-2 text-sm text-red-100">{error}</div>}
        {message && <div role="status" className="mt-4 rounded-[var(--radius-sm)] border border-emerald-400/25 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100">{message}</div>}
      </section>

      <section className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="glass-panel h-fit rounded-[var(--radius-lg)] p-3">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Stories ({stories.length})</p>
          {loading && stories.length === 0 ? (
            <p className="px-2 py-6 text-sm text-[var(--text-muted)]">Loading story archive…</p>
          ) : stories.length === 0 ? (
            <p className="px-2 py-6 text-sm leading-6 text-[var(--text-muted)]">No database stories yet. The four bundled cases still remain live in Entertainment.</p>
          ) : (
            <div className="grid gap-2">
              {stories.map(story => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => setSelectedStoryId(story.id)}
                  aria-current={story.id === selectedStoryId ? 'true' : undefined}
                  className={`min-h-14 rounded-[var(--radius-sm)] border p-3 text-left transition ${story.id === selectedStoryId ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)]' : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] hover:border-[var(--border-panel)]'}`}
                >
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{story.title}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    {story.status === 'published' ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {story.status} · {story.chapters.length} chapters
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {selectedStory ? (
          <main className="grid min-w-0 gap-5">
            <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{selectedStory.status}</p>
                  <h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Story details</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={saveStory} disabled={Boolean(savingKey)}><Save className="mr-2 h-4 w-4" />Save</Button>
                  {selectedStory.status === 'published' ? (
                    <Button type="button" size="sm" variant="secondary" onClick={moveToDraft} disabled={Boolean(savingKey)}><EyeOff className="mr-2 h-4 w-4" />Unpublish</Button>
                  ) : (
                    <Button type="button" size="sm" onClick={publishStory} disabled={Boolean(savingKey)}><Send className="mr-2 h-4 w-4" />Publish</Button>
                  )}
                  <Button type="button" size="sm" variant="danger" onClick={removeStory} disabled={Boolean(savingKey)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>Title<input className={fieldClass} value={storyValues.title} onChange={event => setStoryField('title', event.target.value)} maxLength={140} /></label>
                <label className={labelClass}>Slug<input className={fieldClass} value={storyValues.slug} onChange={event => setStoryField('slug', slugifyShadowMysteryValue(event.target.value))} maxLength={90} /></label>
                <label className={labelClass}>Subtitle<input className={fieldClass} value={storyValues.subtitle} onChange={event => setStoryField('subtitle', event.target.value)} maxLength={240} /></label>
                <label className={labelClass}>Location label<input className={fieldClass} value={storyValues.locationLabel} onChange={event => setStoryField('locationLabel', event.target.value)} maxLength={160} /></label>
                <label className={labelClass}>Read time (minutes)<input className={fieldClass} type="number" min={1} max={120} value={storyValues.readTimeMinutes} onChange={event => setStoryField('readTimeMinutes', Number(event.target.value))} /></label>
                <label className={labelClass}>Publish date<input className={fieldClass} type="date" value={storyValues.publishedAt} onChange={event => setStoryField('publishedAt', event.target.value)} /></label>
                <label className={labelClass}>Bundled story replacement ID<input className={fieldClass} value={storyValues.legacyStoryId ?? ''} onChange={event => setStoryField('legacyStoryId', event.target.value || null)} placeholder="Optional legacy story id" /></label>
                <label className={`${labelClass} sm:col-span-2`}>Story-list deck<textarea className={`${fieldClass} min-h-24 resize-y`} value={storyValues.deck} onChange={event => setStoryField('deck', event.target.value)} maxLength={1200} /></label>
              </div>
            </section>

            <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5">
              <div className="flex items-center gap-2"><ImagePlus className="h-5 w-5 text-[var(--text-gold)]" /><h3 className="text-lg font-semibold text-[var(--text-primary)]">Story artwork</h3></div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Cover and header artwork are required before publication.</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <ArtworkEditor storyId={selectedStory.id} role="cover" artwork={selectedStory.coverImage} saving={Boolean(savingKey)} runAction={runAction} />
                <ArtworkEditor storyId={selectedStory.id} role="header" artwork={selectedStory.headerImage} saving={Boolean(savingKey)} runAction={runAction} />
              </div>
            </section>

            <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h3 className="text-lg font-semibold text-[var(--text-primary)]">Ordered chapters</h3><p className="mt-1 text-sm text-[var(--text-muted)]">Use spaced order values so chapters can be inserted later.</p></div>
                <Button type="button" size="sm" onClick={addChapter} disabled={Boolean(savingKey)}><Plus className="mr-2 h-4 w-4" />Add chapter</Button>
              </div>
              <div className="mt-4 grid gap-4">
                {selectedStory.chapters.map(chapter => <ChapterEditor key={chapter.id} chapter={chapter} saving={Boolean(savingKey)} runAction={runAction} />)}
                {selectedStory.chapters.length === 0 && <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-subtle)] p-5 text-sm text-[var(--text-muted)]">Add at least one chapter before publishing.</p>}
              </div>
            </section>

            <section className="glass-panel rounded-[var(--radius-lg)] p-4 sm:p-5">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Archive sources</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">At least one HTTPS source credit is required before publication.</p>
              <div className="mt-4 grid gap-4">
                {selectedStory.sources.map(source => <SourceEditor key={source.id} source={source} saving={Boolean(savingKey)} runAction={runAction} />)}
                <div className="grid gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-subtle)] p-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Add a source</p>
                  <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                    <label className={labelClass}>Source label<input className={fieldClass} value={newSource.label} onChange={event => setNewSource(previous => ({ ...previous, label: event.target.value }))} /></label>
                    <label className={labelClass}>Order<input className={fieldClass} type="number" min={0} value={newSource.sortOrder} onChange={event => setNewSource(previous => ({ ...previous, sortOrder: event.target.value }))} /></label>
                  </div>
                  <label className={labelClass}>HTTPS URL<input className={fieldClass} value={newSource.url} onChange={event => setNewSource(previous => ({ ...previous, url: event.target.value }))} inputMode="url" /></label>
                  <label className={labelClass}>How it was used<textarea className={`${fieldClass} min-h-20 resize-y`} value={newSource.usage} onChange={event => setNewSource(previous => ({ ...previous, usage: event.target.value }))} /></label>
                  <Button type="button" size="sm" variant="secondary" className="w-fit" onClick={addSource} disabled={Boolean(savingKey)}><Plus className="mr-2 h-4 w-4" />Add source</Button>
                </div>
              </div>
            </section>
          </main>
        ) : (
          <div className="glass-panel rounded-[var(--radius-lg)] p-8 text-center text-sm leading-6 text-[var(--text-muted)]">
            Create or select a database story. The four bundled V1 stories remain available to readers independently.
          </div>
        )}
      </section>
    </div>
  )
}
