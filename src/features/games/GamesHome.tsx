import React from 'react'
import { Gamepad2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { ShadowWarScreen } from './shadow-war/ShadowWarScreen'

export function GamesHome() {
  return (
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

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden md:p-4">
        <section className="glass-panel-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-x-0 border-y-0 border-[var(--border-panel)] md:rounded-[var(--radius-lg)] md:border">
          <ShadowWarScreen />
        </section>
      </main>
    </motion.div>
  )
}
