import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Gamepad2, Volume2, VolumeX } from 'lucide-react'
import { motion } from 'framer-motion'
import { ShadowWarScreen } from './shadow-war/ShadowWarScreen'
import { SHADOW_WAR_ASSETS } from './shadow-war/assets/manifest'
import { ShadowCheckersScreen } from './shadow-checkers/ShadowCheckersScreen'
import { SHADOW_CHECKERS_ASSETS } from './shadow-checkers/assets/manifest'

interface GamesHomeProps {
  onImmersiveChange?: (immersive: boolean) => void
}

type SelectedGame = 'shadow-war' | 'shadow-checkers' | null

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
    void playMusic()
    setSelectedGame('shadow-war')
    onImmersiveChange?.(true)
  }

  const exitShadowWar = () => {
    pauseMusic()
    setAudioBlocked(false)
    setSelectedGame(null)
    onImmersiveChange?.(false)
  }

  const enterShadowCheckers = () => {
    pauseMusic()
    setAudioBlocked(false)
    setSelectedGame('shadow-checkers')
    onImmersiveChange?.(true)
  }

  const exitShadowCheckers = () => {
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

  return (
    <>
      {audio}
      {selectedGame === 'shadow-war' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
        <ShadowWarScreen
          onExit={exitShadowWar}
          musicPlaying={musicPlaying}
          audioBlocked={audioBlocked}
          onToggleMusic={toggleMusic}
        />
        </div>
      ) : selectedGame === 'shadow-checkers' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <ShadowCheckersScreen onExit={exitShadowCheckers} />
        </div>
      ) : (
        <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="theme-app-surface flex h-full min-h-0 flex-col pb-[calc(env(safe-area-inset-bottom)_+_4.2rem)] text-sm md:pb-0"
    >
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
          className="group relative min-h-[9.75rem] w-full overflow-hidden rounded-[2rem] border border-[rgba(215,170,70,0.42)] bg-[#050403] text-left shadow-[0_24px_60px_rgba(0,0,0,0.48)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[rgba(239,202,114,0.68)] focus:outline-none focus:ring-2 focus:ring-[rgba(239,202,114,0.55)] md:min-h-[12rem]"
        >
          <img
            src={SHADOW_WAR_ASSETS.battlefield}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-[0.76]"
            loading="eager"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94),rgba(0,0,0,0.58)_52%,rgba(0,0,0,0.32)),radial-gradient(circle_at_78%_28%,rgba(215,170,70,0.24),transparent_34%)]" />
          <div className="absolute inset-x-6 top-4 h-px bg-gradient-to-r from-transparent via-[#f0d381]/55 to-transparent" />
          <div className="absolute inset-x-6 bottom-4 h-px bg-gradient-to-r from-transparent via-[#8a6328]/60 to-transparent" />
          <div className="relative flex h-full min-h-[9.75rem] items-center gap-4 px-5 py-5 md:min-h-[12rem] md:px-8">
            <div className="min-w-0 flex-1">
              <img
                src={SHADOW_WAR_ASSETS.logo}
                alt="Shadow War"
                className="mx-auto mb-3 h-auto w-full max-w-[30rem] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)] md:mx-0"
                loading="eager"
              />
              <p className="mx-auto max-w-xl text-center text-sm leading-6 text-[#d9c79f] md:mx-0 md:text-left md:text-base">
                A medieval tactical card duel of hidden lanes, warbands, and live rivals.
              </p>
            </div>
            <div className="hidden rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] p-3 text-[#f0d381] md:block">
              {musicPlaying ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </div>
          </div>
        </button>

        <button
          type="button"
          aria-label="Open Shadow Checkers"
          onClick={enterShadowCheckers}
          className="group relative min-h-[9.75rem] w-full overflow-hidden rounded-[2rem] border border-[rgba(215,170,70,0.42)] bg-[#050403] text-left shadow-[0_24px_60px_rgba(0,0,0,0.48)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[rgba(239,202,114,0.68)] focus:outline-none focus:ring-2 focus:ring-[rgba(239,202,114,0.55)] md:min-h-[12rem]"
        >
          <img
            src={SHADOW_CHECKERS_ASSETS.pickerArt}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-[0.86]"
            loading="eager"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94),rgba(0,0,0,0.56)_52%,rgba(0,0,0,0.24)),radial-gradient(circle_at_78%_28%,rgba(215,170,70,0.24),transparent_34%)]" />
          <div className="absolute inset-x-6 top-4 h-px bg-gradient-to-r from-transparent via-[#f0d381]/55 to-transparent" />
          <div className="absolute inset-x-6 bottom-4 h-px bg-gradient-to-r from-transparent via-[#8a6328]/60 to-transparent" />
          <div className="relative flex h-full min-h-[9.75rem] items-center gap-4 px-5 py-5 md:min-h-[12rem] md:px-8">
            <div className="min-w-0 flex-1">
              <img
                src={SHADOW_CHECKERS_ASSETS.logo}
                alt="Shadow Checkers"
                className="mx-auto mb-3 h-auto w-full max-w-[30rem] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)] md:mx-0"
                loading="eager"
              />
              <p className="mx-auto max-w-xl text-center text-sm leading-6 text-[#d9c79f] md:mx-0 md:text-left md:text-base">
                A cinematic multiplayer checkers duel with public tables, spectators, and Hall of Fame crowns.
              </p>
            </div>
            <div className="hidden rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] p-3 text-[#f0d381] md:block">
              <Gamepad2 className="h-5 w-5" />
            </div>
          </div>
        </button>

      </main>
        </motion.div>
      )}
    </>
  )
}
