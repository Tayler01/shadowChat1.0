import { useEffect, useState } from 'react'
import { ArrowLeft, Headphones, Play } from 'lucide-react'
import { motion } from 'framer-motion'
import { WILL_KIRK_ASSETS } from './assets/manifest'
import { fetchShadoTvCatalog, type ShadoTvCatalog } from '../shado-tv/api'
import { ShadoTvStreamFrame } from '../shado-tv/ShadoTvStreamFrame'
import { PrivateMediaImage } from '../../../components/ui/PrivateMediaImage'
import { getWillKirkStories } from './catalog'

interface WillKirkScreenProps {
  onExit: () => void
}

export function WillKirkScreen({ onExit }: WillKirkScreenProps) {
  const [catalog, setCatalog] = useState<ShadoTvCatalog | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const next = await fetchShadoTvCatalog()
        if (!next.loadedFromSupabase) throw new Error('Catalog unavailable')
        if (!cancelled) { setCatalog(next); setError(false); setNow(Date.now()) }
      } catch { if (!cancelled) setError(true) }
    }
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, 60_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [attempt])
  const stories = catalog ? getWillKirkStories(catalog, now) : []
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#020202] text-white"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(215,170,70,0.1),transparent_36%),linear-gradient(180deg,rgba(6,5,4,0.94),#000)]" />
      <header className="relative z-10 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-end border-b border-[#8a6328]/24 bg-black/72 px-3 pb-2 pt-[env(safe-area-inset-top)] shadow-[0_12px_34px_rgba(0,0,0,0.58)]">
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExit}
            aria-label="Back to Entertainment"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d2b58a]/24 bg-black/32 text-[#e7c489] transition hover:border-[#e3b061]/55 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#8a6328]/55"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-black uppercase tracking-[0.2em] text-[#f1dbc0]">Will &amp; Kirk</p>
          </div>
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d2b58a]/20 bg-black/28 text-[#c89561]">
            <Headphones className="h-5 w-5" />
          </span>
        </div>
      </header>
      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)_+_1.5rem)]">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <img src={WILL_KIRK_ASSETS.pickerBanner} alt="Will & Kirk" width={1920} height={720} className="w-full rounded-2xl border border-[var(--border-subtle)]" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Friday stories</h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">A new audio story every Friday. 15–20 minutes, with cover art.</p>
              <p className="mt-2 text-xs text-[var(--text-gold)]">Newest first · Settle in and press play</p>
            </div>
          </div>
            {error && <div role="alert" className="rounded-xl border border-[var(--border-subtle)] p-4 text-sm">Stories couldn’t refresh. <button type="button" className="min-h-11 px-3 text-[var(--text-gold)] underline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
            {!catalog && !error && <p role="status">Loading stories…</p>}
            {catalog && !error && stories.length === 0 && <section className="rounded-2xl border border-[var(--border-subtle)] p-6 text-center"><h2 className="font-semibold text-[var(--text-gold)]">The first story is on its way</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">You’ll find it here when it’s released. Come back on Fridays for more.</p></section>}
            {stories.map((story, index) => <article key={story.id} className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
              <div className="relative aspect-video w-full bg-black">
                {activeId === story.id ? <ShadoTvStreamFrame key={story.id} src={story.embedUrl!} title={story.title} captions={story.captionTracks} /> : <button type="button" aria-label={`Play ${story.title}`} onClick={() => setActiveId(story.id)} className="absolute inset-0 h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--text-gold)]">
                  <PrivateMediaImage src={story.posterAsset} alt="" loading="lazy" className="h-full w-full object-contain" />
                  <span className="absolute inset-0 grid place-items-center bg-black/20"><span className="grid h-14 w-14 place-items-center rounded-full border border-[var(--border-glow)] bg-black/80 text-[var(--text-gold)]"><Play aria-hidden="true" className="h-6 w-6" /></span></span>
                </button>}
              </div>
              <div className="p-4">
                <p className="text-xs text-[var(--text-gold)]">{index === 0 ? 'Latest story · ' : ''}<time dateTime={story.releasedAt!}>{new Date(story.releasedAt!).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time> · {story.durationLabel}</p>
                <h2 className="mt-2 break-words text-lg font-bold text-[var(--text-primary)]">{story.title}</h2>
                {story.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-secondary)]">{story.description}</p>}
              </div>
            </article>)}
        </div>
      </main>
    </motion.div>
  )
}
