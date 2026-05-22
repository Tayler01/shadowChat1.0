import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Film, Gamepad2, Volume2, VolumeX } from 'lucide-react'
import { motion } from 'framer-motion'
import { ShadowWarScreen } from './shadow-war/ShadowWarScreen'
import { SHADOW_WAR_ASSETS } from './shadow-war/assets/manifest'
import { ShadowCheckersScreen } from './shadow-checkers/ShadowCheckersScreen'
import { SHADOW_CHECKERS_ASSETS } from './shadow-checkers/assets/manifest'
import { ShadoTvScreen } from '../entertainment/shado-tv/ShadoTvScreen'
import { SHADO_TV_ASSETS } from '../entertainment/shado-tv/assets/manifest'
import { ShadowMysteryScreen } from '../entertainment/shadow-mystery/ShadowMysteryScreen'
import { SHADOW_MYSTERY_ASSETS } from '../entertainment/shadow-mystery/assets/manifest'
import { MobileAppHeader } from '../../components/layout/MobileAppHeader'
import type { AppView } from '../../types/navigation'

interface GamesHomeProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  onImmersiveChange?: (immersive: boolean) => void
}

type SelectedEntertainment = 'shadow-war' | 'shadow-checkers' | 'shado-tv' | 'shadow-mystery' | null

export function GamesHome({ currentView, onViewChange, onImmersiveChange }: GamesHomeProps) {
  const [selectedEntertainment, setSelectedEntertainment] = useState<SelectedEntertainment>(null)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playMusic = useCallback(async (source?: string) => {
    const audio = audioRef.current
    if (!audio) return

    if (source && audio.getAttribute('src') !== source) {
      audio.pause()
      audio.setAttribute('src', source)
      audio.load()
    }

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
    void playMusic(SHADOW_WAR_ASSETS.music)
    setSelectedEntertainment('shadow-war')
    onImmersiveChange?.(true)
  }

  const exitShadowWar = () => {
    pauseMusic()
    setAudioBlocked(false)
    setSelectedEntertainment(null)
    onImmersiveChange?.(false)
  }

  const enterShadowCheckers = () => {
    void playMusic(SHADOW_CHECKERS_ASSETS.music)
    setAudioBlocked(false)
    setSelectedEntertainment('shadow-checkers')
    onImmersiveChange?.(true)
  }

  const exitShadowCheckers = () => {
    pauseMusic()
    setAudioBlocked(false)
    setSelectedEntertainment(null)
    onImmersiveChange?.(false)
  }

  const enterShadoTv = () => {
    pauseMusic()
    setAudioBlocked(false)
    setSelectedEntertainment('shado-tv')
    onImmersiveChange?.(true)
  }

  const exitShadoTv = () => {
    setAudioBlocked(false)
    setSelectedEntertainment(null)
    onImmersiveChange?.(false)
  }

  const enterShadowMystery = () => {
    pauseMusic()
    setAudioBlocked(false)
    setSelectedEntertainment('shadow-mystery')
    onImmersiveChange?.(true)
  }

  const exitShadowMystery = () => {
    setAudioBlocked(false)
    setSelectedEntertainment(null)
    onImmersiveChange?.(false)
  }

  const toggleMusic = () => {
    if (musicPlaying) {
      pauseMusic()
      return
    }
    const source = selectedEntertainment === 'shadow-checkers' ? SHADOW_CHECKERS_ASSETS.music : SHADOW_WAR_ASSETS.music
    void playMusic(source)
  }

  useEffect(() => {
    onImmersiveChange?.(selectedEntertainment !== null)
  }, [onImmersiveChange, selectedEntertainment])

  useEffect(() => {
    return () => {
      pauseMusic()
      onImmersiveChange?.(false)
    }
  }, [onImmersiveChange, pauseMusic])

  const audio = (
    <audio
      ref={audioRef}
      preload="auto"
      aria-hidden="true"
    />
  )

  return (
    <>
      {audio}
      {selectedEntertainment === 'shadow-war' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
        <ShadowWarScreen
          onExit={exitShadowWar}
          musicPlaying={musicPlaying}
          audioBlocked={audioBlocked}
          onToggleMusic={toggleMusic}
        />
        </div>
      ) : selectedEntertainment === 'shadow-checkers' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <ShadowCheckersScreen
            onExit={exitShadowCheckers}
            musicPlaying={musicPlaying}
            audioBlocked={audioBlocked}
            onToggleMusic={toggleMusic}
          />
        </div>
      ) : selectedEntertainment === 'shado-tv' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <ShadoTvScreen onExit={exitShadoTv} />
        </div>
      ) : selectedEntertainment === 'shadow-mystery' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <ShadowMysteryScreen onExit={exitShadowMystery} />
        </div>
      ) : (
        <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="theme-app-surface flex h-full min-h-0 flex-col pb-[calc(env(safe-area-inset-bottom)_+_4.2rem)] text-sm md:pb-0"
    >
      <MobileAppHeader
        currentView={currentView}
        onViewChange={onViewChange}
        title="Entertainment"
        logo
      />

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 md:p-6">
        <button
          type="button"
          aria-label="Open Shado TV"
          onClick={enterShadoTv}
          className="group relative min-h-[8.25rem] w-full overflow-hidden rounded-[2rem] border border-[rgba(215,170,70,0.42)] bg-[#050403] text-left shadow-[0_24px_60px_rgba(0,0,0,0.48)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[rgba(239,202,114,0.68)] focus:outline-none focus:ring-2 focus:ring-[rgba(239,202,114,0.55)] md:min-h-[10rem]"
        >
          <img
            src={SHADO_TV_ASSETS.pickerBanner}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-[0.86]"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={1440}
            height={810}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.52)_54%,rgba(0,0,0,0.2)),radial-gradient(circle_at_76%_22%,rgba(215,170,70,0.28),transparent_34%)]" />
          <div className="absolute inset-x-6 top-4 h-px bg-gradient-to-r from-transparent via-[#f0d381]/55 to-transparent" />
          <div className="absolute inset-x-6 bottom-4 h-px bg-gradient-to-r from-transparent via-[#8a6328]/60 to-transparent" />
          <div className="relative flex h-full min-h-[8.25rem] items-center gap-4 px-5 py-4 md:min-h-[10rem] md:px-8">
            <div className="min-w-0 flex-1">
              <img
                src={SHADO_TV_ASSETS.logoMarquee}
                alt="Shado TV"
                className="mx-auto h-auto w-full max-w-[21rem] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)] md:mx-0 md:max-w-[23rem]"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                width={1400}
                height={560}
              />
            </div>
            <div className="hidden rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] p-3 text-[#f0d381] md:block">
              <Film className="h-5 w-5" />
            </div>
          </div>
        </button>

        <button
          type="button"
          aria-label="Open Shadow Mystery"
          onClick={enterShadowMystery}
          className="group relative aspect-[1672/941] w-full overflow-hidden rounded-[2rem] border border-[rgba(215,170,70,0.42)] bg-[#050403] shadow-[0_24px_60px_rgba(0,0,0,0.48)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[rgba(239,202,114,0.68)] focus:outline-none focus:ring-2 focus:ring-[rgba(239,202,114,0.55)]"
        >
          <img
            src={SHADOW_MYSTERY_ASSETS.pickerBanner}
            alt="Shadow Mystery"
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={1672}
            height={941}
          />
        </button>

        <button
          type="button"
          aria-label="Open Shadow War"
          onClick={enterShadowWar}
          className="group relative min-h-[8.25rem] w-full overflow-hidden rounded-[2rem] border border-[rgba(215,170,70,0.42)] bg-[#050403] text-left shadow-[0_24px_60px_rgba(0,0,0,0.48)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[rgba(239,202,114,0.68)] focus:outline-none focus:ring-2 focus:ring-[rgba(239,202,114,0.55)] md:min-h-[10rem]"
        >
          <img
            src={SHADOW_WAR_ASSETS.pickerBattlefield}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-[0.76]"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={720}
            height={1280}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94),rgba(0,0,0,0.58)_52%,rgba(0,0,0,0.32)),radial-gradient(circle_at_78%_28%,rgba(215,170,70,0.24),transparent_34%)]" />
          <div className="absolute inset-x-6 top-4 h-px bg-gradient-to-r from-transparent via-[#f0d381]/55 to-transparent" />
          <div className="absolute inset-x-6 bottom-4 h-px bg-gradient-to-r from-transparent via-[#8a6328]/60 to-transparent" />
          <div className="relative flex h-full min-h-[8.25rem] items-center gap-4 px-5 py-4 md:min-h-[10rem] md:px-8">
            <div className="min-w-0 flex-1">
              <img
                src={SHADOW_WAR_ASSETS.logo}
                alt="Shadow War"
                className="mx-auto h-auto w-full max-w-[30rem] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)] md:mx-0"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                width={960}
                height={240}
              />
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
          className="group relative min-h-[8.25rem] w-full overflow-hidden rounded-[2rem] border border-[rgba(215,170,70,0.42)] bg-[#050403] text-left shadow-[0_24px_60px_rgba(0,0,0,0.48)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[rgba(239,202,114,0.68)] focus:outline-none focus:ring-2 focus:ring-[rgba(239,202,114,0.55)] md:min-h-[10rem]"
        >
          <img
            src={SHADOW_CHECKERS_ASSETS.pickerArt}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-[0.86]"
            loading="lazy"
            decoding="async"
            width={720}
            height={1280}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94),rgba(0,0,0,0.56)_52%,rgba(0,0,0,0.24)),radial-gradient(circle_at_78%_28%,rgba(215,170,70,0.24),transparent_34%)]" />
          <div className="absolute inset-x-6 top-4 h-px bg-gradient-to-r from-transparent via-[#f0d381]/55 to-transparent" />
          <div className="absolute inset-x-6 bottom-4 h-px bg-gradient-to-r from-transparent via-[#8a6328]/60 to-transparent" />
          <div className="relative flex h-full min-h-[8.25rem] items-center gap-4 px-5 py-4 md:min-h-[10rem] md:px-8">
            <div className="min-w-0 flex-1">
              <img
                src={SHADOW_CHECKERS_ASSETS.pickerLogo}
                alt="Shadow Checkers"
                className="mx-auto h-auto w-full max-w-[30rem] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)] md:mx-0"
                loading="lazy"
                decoding="async"
                width={960}
                height={320}
              />
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
