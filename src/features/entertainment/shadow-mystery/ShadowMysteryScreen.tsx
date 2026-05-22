import React, { useMemo, useState } from 'react'
import { Archive, ArrowLeft, Camera, ChevronRight, Clock, MapPin } from 'lucide-react'
import { motion } from 'framer-motion'
import { SHADOW_MYSTERY_ASSETS } from './assets/manifest'
import { getShadowMysteryStories, getShadowMysteryStory, type ShadowMysteryImage, type ShadowMysteryStory } from './data'

interface ShadowMysteryScreenProps {
  onExit: () => void
}

type ShadowMysteryView =
  | { type: 'home' }
  | { type: 'story'; storyId: string }

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d2b58a]/24 bg-black/32 text-[#e7c489] transition hover:border-[#e3b061]/55 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#8f2f2f]/50"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  )
}

function ShadowMysteryHeader({
  title,
  backgroundAsset,
  onBack,
  onExit,
}: {
  title: string
  backgroundAsset: string
  onBack?: () => void
  onExit: () => void
}) {
  return (
    <header className="relative z-20 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-end overflow-hidden border-b border-[#8a6328]/30 bg-[#050403]/95 px-3 pb-2 pt-[env(safe-area-inset-top)] shadow-[0_12px_34px_rgba(0,0,0,0.58)]">
      <img
        src={backgroundAsset}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-55"
        width={1600}
        height={686}
        loading="eager"
        decoding="async"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,4,3,0.92),rgba(5,4,3,0.5)_48%,rgba(5,4,3,0.92)),linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.62))]" />
      <div className="relative flex w-full items-center justify-between gap-3">
        <BackButton onClick={onBack ?? onExit} label={onBack ? 'Back to Shadow Mystery' : 'Back to Entertainment'} />
        <div className="min-w-0 text-center">
          <p className="text-[0.62rem] font-black uppercase tracking-[0.24em] text-[#c89561]">Shadow Mystery</p>
          <p className="truncate text-sm font-black uppercase tracking-[0.12em] text-[#f1dbc0]">{title}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d2b58a]/20 bg-black/28 text-[#c89561]">
          <Archive className="h-5 w-5" />
        </span>
      </div>
    </header>
  )
}

function ImagePlate({ image, priority = false }: { image: ShadowMysteryImage; priority?: boolean }) {
  return (
    <figure className="my-6 overflow-hidden rounded-xl border border-[#b88452]/24 bg-[#090806] shadow-[0_18px_42px_rgba(0,0,0,0.42)]">
      <img
        src={image.asset}
        alt={image.alt}
        className="aspect-[16/10] w-full object-cover"
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
      <figcaption className="border-t border-[#b88452]/18 bg-black/34 px-4 py-3 text-[0.75rem] font-semibold leading-5 text-[#dac5a3]/78">
        {image.caption}
        {image.credit && (
          <span className="mt-1 block text-[0.65rem] uppercase tracking-[0.14em] text-[#c89561]/78">
            Image: {image.credit}
            {image.license ? `, ${image.license}` : ''}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

function StoryCard({ story, onOpen }: { story: ShadowMysteryStory; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative w-full overflow-hidden rounded-2xl border border-[#b88452]/30 bg-[#070604] text-left shadow-[0_24px_62px_rgba(0,0,0,0.48)] transition hover:-translate-y-0.5 hover:border-[#d8b06f]/58 focus:outline-none focus:ring-2 focus:ring-[#8f2f2f]/55"
    >
      <div className="grid gap-0 sm:grid-cols-[13rem_1fr]">
        <div className="relative min-h-[18rem] overflow-hidden sm:min-h-[19rem]">
          <img
            src={story.coverAsset}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            width={900}
            height={1125}
            loading="eager"
            decoding="async"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.72))]" />
          <div className="absolute bottom-4 left-4 right-4">
            <span className="inline-flex rounded-full border border-[#d8b06f]/35 bg-black/48 px-3 py-1 text-[0.62rem] font-black uppercase tracking-[0.18em] text-[#e5c28f]">
              New case
            </span>
          </div>
        </div>
        <div className="relative flex min-h-[18rem] flex-col justify-between p-5 sm:min-h-[19rem]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#c89561]">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {story.locationLabel}
              </span>
              <span>{formatDate(story.publishedAt)}</span>
            </div>
            <h2 className="mt-3 text-3xl font-black uppercase leading-8 text-[#f1dbc0] sm:text-4xl sm:leading-10">
              {story.title}
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#dac5a3]/82">{story.deck}</p>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#d8b06f]">
              <Clock className="h-4 w-4" />
              {story.readTimeMinutes} min read
            </span>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d8b06f]/45 bg-[#7b2020]/24 text-[#f1dbc0]">
              <ChevronRight className="h-5 w-5" />
            </span>
          </div>
        </div>
      </div>
    </button>
  )
}

function HomeView({ stories, onOpenStory }: { stories: ShadowMysteryStory[]; onOpenStory: (storyId: string) => void }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)_+_1.25rem)] pt-4">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-[#b88452]/28 bg-[#050403] shadow-[0_24px_70px_rgba(0,0,0,0.5)]">
        <img
          src={SHADOW_MYSTERY_ASSETS.pickerBanner}
          alt="Shadow Mystery"
          className="aspect-[1672/941] w-full object-cover"
          width={1672}
          height={941}
          loading="eager"
          decoding="async"
        />
      </section>

      <section className="mx-auto mt-5 grid max-w-5xl gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#c89561]">Case list</p>
            <h2 className="mt-1 text-xl font-black uppercase text-[#f1dbc0]">Newest first</h2>
          </div>
          <span className="text-xs font-black uppercase tracking-[0.16em] text-[#d8b06f]/78">
            {stories.length} {stories.length === 1 ? 'story' : 'stories'}
          </span>
        </div>
        {stories.map(story => (
          <StoryCard key={story.id} story={story} onOpen={() => onOpenStory(story.id)} />
        ))}
      </section>
    </main>
  )
}

function StoryView({ story }: { story: ShadowMysteryStory }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)_+_1.25rem)]">
      <article className="mx-auto max-w-4xl">
        <section className="relative overflow-hidden border-b border-[#b88452]/22 bg-[#050403]">
          <img
            src={story.headerAsset}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-64"
            width={1600}
            height={686}
            loading="eager"
            decoding="async"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,4,3,0.34),rgba(5,4,3,0.96)),linear-gradient(90deg,rgba(5,4,3,0.92),rgba(5,4,3,0.48)_58%,rgba(5,4,3,0.76))]" />
          <div className="relative px-4 py-7 sm:px-6 sm:py-10">
            <div className="grid gap-5 sm:grid-cols-[13rem_1fr] sm:items-end">
              <img
                src={story.coverAsset}
                alt=""
                className="mx-auto w-full max-w-[13rem] rounded-xl border border-[#d8b06f]/26 object-cover shadow-[0_20px_54px_rgba(0,0,0,0.58)] sm:mx-0"
                width={900}
                height={1125}
                loading="eager"
                decoding="async"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-[#c89561]">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {story.locationLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {story.readTimeMinutes} min
                  </span>
                </div>
                <h1 className="mt-3 text-4xl font-black uppercase leading-10 text-[#f1dbc0] sm:text-5xl sm:leading-[3.25rem]">
                  {story.title}
                </h1>
                <p className="mt-3 text-sm font-black uppercase tracking-[0.16em] text-[#d8b06f]">{story.subtitle}</p>
                <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-[#dac5a3]/86">{story.deck}</p>
                <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-[#c89561]/74">{formatDate(story.publishedAt)}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="px-4 py-5 sm:px-6">
          {story.chapters.map((chapter, chapterIndex) => (
            <section key={chapter.id} className="border-b border-[#b88452]/16 py-6 last:border-b-0">
              {chapter.kicker && (
                <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#c89561]">{chapter.kicker}</p>
              )}
              <h2 className="mt-2 text-2xl font-black uppercase leading-8 text-[#f1dbc0] sm:text-3xl">{chapter.title}</h2>
              {chapter.image && <ImagePlate image={chapter.image} priority={chapterIndex === 0} />}
              <div className="mt-4 space-y-4 text-[0.98rem] font-medium leading-8 text-[#ead9bf]/86">
                {chapter.body.map((paragraph, index) => (
                  <p key={`${chapter.id}-${index}`}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}

          <section className="mt-6 rounded-xl border border-[#b88452]/22 bg-black/30 p-4">
            <div className="flex items-center gap-2 text-[#c89561]">
              <Camera className="h-4 w-4" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em]">Archive notes and image credits</h2>
            </div>
            <div className="mt-3 grid gap-2">
              {story.sources.map(source => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-[#d8b06f]/35"
                >
                  <span className="block text-sm font-black text-[#f1dbc0]">{source.label}</span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-[#dac5a3]/70">{source.usage}</span>
                </a>
              ))}
            </div>
          </section>
        </div>
      </article>
    </main>
  )
}

export function ShadowMysteryScreen({ onExit }: ShadowMysteryScreenProps) {
  const [view, setView] = useState<ShadowMysteryView>({ type: 'home' })
  const stories = useMemo(() => getShadowMysteryStories(), [])
  const story = view.type === 'story' ? getShadowMysteryStory(view.storyId) : undefined
  const backgroundAsset = story?.headerAsset ?? SHADOW_MYSTERY_ASSETS.pickerBanner

  const goBack = () => {
    if (view.type === 'home') {
      onExit()
      return
    }
    setView({ type: 'home' })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#050403] text-white"
    >
      <img
        src={backgroundAsset}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-[0.12]"
        width={1600}
        height={686}
        loading="eager"
        decoding="async"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_0%,rgba(143,47,47,0.16),transparent_34%),linear-gradient(180deg,rgba(8,7,5,0.88),rgba(0,0,0,0.97))]" />
      <ShadowMysteryHeader
        title={story?.title ?? 'Case archive'}
        backgroundAsset={backgroundAsset}
        onBack={view.type === 'home' ? undefined : goBack}
        onExit={onExit}
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {view.type === 'story' && story ? (
          <StoryView story={story} />
        ) : (
          <HomeView stories={stories} onOpenStory={storyId => setView({ type: 'story', storyId })} />
        )}
      </div>
    </motion.div>
  )
}
