import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquareText, Newspaper } from 'lucide-react'
import { NewsFeed } from './NewsFeed'
import { NewsChat } from './NewsChat'
import { useNewsBadges } from '../../hooks/useNewsBadges'
import { cn } from '../../lib/utils'

type NewsTab = 'feed' | 'chat'

const tabs: Array<{ id: NewsTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'feed', label: 'News Feed', icon: Newspaper },
  { id: 'chat', label: 'News Chat', icon: MessageSquareText },
]

export function NewsView() {
  const [activeTab, setActiveTab] = useState<NewsTab>('feed')
  const { markSeen } = useNewsBadges()

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void markSeen(activeTab)
    }, 500)

    return () => window.clearTimeout(handle)
  }, [activeTab, markSeen])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.06),transparent_28%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] pb-[calc(env(safe-area-inset-bottom)_+_4.2rem)] text-sm md:pb-0"
    >
      <header className="glass-panel-strong flex-shrink-0 border-b border-[var(--border-panel)] px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">ShadowChat News</p>
            <h1 className="mt-1 text-xl font-semibold text-[var(--text-primary)] md:text-2xl">News</h1>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-[rgba(215,170,70,0.13)] text-[var(--text-gold)] shadow-[var(--shadow-gold-soft)]'
                    : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]'
                )}
                aria-pressed={activeTab === tab.id}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden md:p-4">
        <section className="glass-panel-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-x-0 border-y-0 border-[var(--border-panel)] md:rounded-[var(--radius-lg)] md:border">
          {activeTab === 'feed' ? <NewsFeed /> : <NewsChat />}
        </section>
      </main>
    </motion.div>
  )
}
