import { useEffect, useState } from 'react'
import { ArrowLeft, Play } from 'lucide-react'
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
      <header className="relative z-10 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-end border-b border-[#8a6328]/24 bg-[linear-gradient(100deg,#181007,#080b12_50%,#101a29)] px-3 pb-2 pt-[env(safe-area-inset-top)] shadow-[0_12px_34px_rgba(0,0,0,0.58)]">
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExit}
            aria-label="Back to Entertainment"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d2b58a]/24 bg-black/32 text-[#e7c489] transition hover:border-[#e3b061]/55 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#8a6328]/55"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex h-11 min-w-0 flex-1 items-center justify-center">
            <img src={WILL_KIRK_ASSETS.headerWordmark} alt="Will & Kirk" className="h-full w-full max-w-[15rem] object-contain" width={768} height={147} />
          </h1>
          <span aria-hidden="true" className="h-11 w-11 shrink-0" />
        </div>
      </header>
      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)_+_0.75rem)]">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            {error && <div role="alert" className="rounded-xl border border-[var(--border-subtle)] p-4 text-sm">Stories couldn’t refresh. <button type="button" className="min-h-11 px-3 text-[var(--text-gold)] underline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
            {!catalog && !error && <p role="status">Loading stories…</p>}
            {catalog && !error && stories.length === 0 && <section className="rounded-2xl border border-[var(--border-subtle)] p-6 text-center"><h2 className="font-semibold text-[var(--text-gold)]">The first story is on its way</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">You’ll find it here when it’s released. Come back on Fridays for more.</p></section>}
            {stories.map(story => <article key={story.id} aria-label={story.title} className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-black">
              <div className="relative aspect-video w-full bg-black">
                {activeId === story.id ? <ShadoTvStreamFrame key={story.id} src={story.embedUrl!} title={story.title} captions={story.captionTracks} /> : <button type="button" aria-label={`Play ${story.title}`} onClick={() => setActiveId(story.id)} className="absolute inset-0 h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--text-gold)]">
                  <PrivateMediaImage src={story.posterAsset} alt="" loading="lazy" className="h-full w-full object-contain" />
                  <span className="absolute inset-0 grid place-items-center bg-black/20"><span className="grid h-14 w-14 place-items-center rounded-full border border-[var(--border-glow)] bg-black/80 text-[var(--text-gold)]"><Play aria-hidden="true" className="h-6 w-6" /></span></span>
                </button>}
              </div>
            </article>)}
        </div>
      </main>
    </motion.div>
  )
}
