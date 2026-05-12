import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Gamepad2, Play, Swords, Volume2, VolumeX } from 'lucide-react'
import { motion } from 'framer-motion'
import { ShadowWarScreen } from './shadow-war/ShadowWarScreen'
import { SHADOW_WAR_ASSETS } from './shadow-war/assets/manifest'

interface GamesHomeProps {
  onImmersiveChange?: (immersive: boolean) => void
}

type SelectedGame = 'shadow-war' | null

export function GamesHome({ onImmersiveChange }: GamesHomeProps) {
  const [selectedGame, setSelectedGame] = useState<SelectedGame>(null)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playMusic = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    audio.volume = 0.42
    audio.loop = true

    try {
      await audio.play()
      setMusicPlaying(true)
      setAudioBlocked(false)
    } catch {
      setMusicPlaying(false)
      setAudioBlocked(true)
    }
  }, [])

  const pauseMusic = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
    }
    setMusicPlaying(false)
  }, [])

  const enterShadowWar = () => {
    setSelectedGame('shadow-war')
    onImmersiveChange?.(true)
    void playMusic()
  }

  const exitShadowWar = () => {
    pauseMusic()
    setAudioBlocked(false)
    setSelectedGame(null)
    onImmersiveChange?.(false)
  }

  const toggleMusic = () => {
    if (musicPlaying) {
      pauseMusic()
      return
    }
    void playMusic()
  }

  useEffect(() => {
    onImmersiveChange?.(selectedGame !== null)
  }, [onImmersiveChange, selectedGame])

  useEffect(() => {
    return () => {
      pauseMusic()
      onImmersiveChange?.(false)
    }
  }, [onImmersiveChange, pauseMusic])

  const audio = (
    <audio
      ref={audioRef}
      src={SHADOW_WAR_ASSETS.music}
      preload="auto"
      aria-hidden="true"
    />
  )

  if (selectedGame === 'shadow-war') {
    return (
      <div className="h-full min-h-0 overflow-hidden bg-black">
        {audio}
        <ShadowWarScreen
          onExit={exitShadowWar}
          musicPlaying={musicPlaying}
          audioBlocked={audioBlocked}
          onToggleMusic={toggleMusic}
        />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="theme-app-surface flex h-full min-h-0 flex-col pb-[calc(env(safe-area-inset-bottom)_+_4.2rem)] text-sm md:pb-0"
    >
      {audio}
      <header className="glass-panel-strong flex-shrink-0 border-b border-[var(--border-panel)] px-4 py-3 md:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">ShadowChat</p>
            <h1 className="text-xl font-semibold text-[var(--text-primary)] md:text-2xl">Games</h1>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]">
            <Gamepad2 className="h-5 w-5" />
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 md:p-6">
        <button
          type="button"
          aria-label="Open Shadow War"
          onClick={enterShadowWar}
          className="group relative min-h-[9.75rem] w-full overflow-hidden rounded-[2rem] border border-[rgba(215,170,70,0.34)] bg-black text-left shadow-[0_24px_60px_rgba(0,0,0,0.42)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[rgba(239,202,114,0.62)] focus:outline-none focus:ring-2 focus:ring-[rgba(239,202,114,0.55)] md:min-h-[12rem]"
        >
          <img
            src={SHADOW_WAR_ASSETS.battlefield}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-[0.76]"
            loading="eager"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.54)_48%,rgba(0,0,0,0.28)),radial-gradient(circle_at_78%_28%,rgba(215,170,70,0.2),transparent_32%)]" />
          <div className="relative flex h-full min-h-[9.75rem] items-center gap-4 px-5 py-5 md:min-h-[12rem] md:px-8">
            <div className="hidden h-24 w-24 shrink-0 items-center justify-center rounded-full border border-[rgba(239,202,114,0.35)] bg-[rgba(5,6,7,0.72)] shadow-[0_0_45px_rgba(215,170,70,0.18)] sm:flex">
              <Swords className="h-10 w-10 text-[#f0d381]" />
            </div>
            <div className="min-w-0 flex-1">
              <img
                src={SHADOW_WAR_ASSETS.logo}
                alt="Shadow War"
                className="mb-3 h-auto w-full max-w-[28rem] object-contain object-left drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)]"
                loading="eager"
              />
              <p className="max-w-xl text-sm leading-6 text-[#d9c79f] md:text-base">
                Enter the full-screen medieval war table, lock hidden formations, and duel live against another player.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[rgba(239,202,114,0.42)] bg-[rgba(215,170,70,0.13)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#f4d789]">
                <Play className="h-3.5 w-3.5 fill-current" />
                Start Shadow War
              </div>
            </div>
            <div className="hidden rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] p-3 text-[#f0d381] md:block">
              {musicPlaying ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </div>
          </div>
        </button>

        <section className="rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[var(--bg-panel)] px-4 py-4 text-sm text-[var(--text-secondary)]">
          More games are coming here. Shadow War is first, and this selector is now built to hold the next arenas without nesting games inside Boards.
        </section>
      </main>
    </motion.div>
  )
}
