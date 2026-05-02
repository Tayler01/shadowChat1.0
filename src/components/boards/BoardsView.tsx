import React, { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { BoardBubbleMap } from './BoardBubbleMap'
import { BoardChat } from './BoardChat'
import { NewsFeed } from '../news/NewsFeed'
import { Button } from '../ui/Button'
import type { BoardDefinition } from '../../lib/boards'
import { useBoardBadges } from '../../hooks/useBoardBadges'

interface BoardsViewProps {
  resetKey?: number
}

export function BoardsView({ resetKey = 0 }: BoardsViewProps) {
  const [activeBoard, setActiveBoard] = useState<BoardDefinition | null>(null)
  const [mapKey, setMapKey] = useState(0)
  const { countsByBoard, markFeedSeen } = useBoardBadges()

  useEffect(() => {
    setActiveBoard(null)
    setMapKey(value => value + 1)
  }, [resetKey])

  useEffect(() => {
    if (activeBoard?.slug === 'news-feed') {
      void markFeedSeen()
    }
  }, [activeBoard?.slug, markFeedSeen])

  const openBoard = (board: BoardDefinition) => {
    setActiveBoard(board)
  }

  const closeBoard = () => {
    setActiveBoard(null)
    setMapKey(value => value + 1)
  }

  const renderActiveBoard = () => {
    if (!activeBoard) return null

    if (activeBoard.kind === 'chat') {
      return <BoardChat board={activeBoard} />
    }

    if (activeBoard.kind === 'feed') {
      return <NewsFeed />
    }

    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Coming soon</h2>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.06),transparent_28%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] pb-[calc(env(safe-area-inset-bottom)_+_4.2rem)] text-sm md:pb-0"
    >
      <header className="glass-panel-strong flex-shrink-0 border-b border-[var(--border-panel)] px-4 py-3 md:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            {activeBoard ? (
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={closeBoard}
                  className="h-9 w-9 shrink-0 p-0"
                  aria-label="Back to boards"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Boards</p>
                  <h1 className="truncate text-lg font-semibold text-[var(--text-primary)] md:text-xl">{activeBoard.title}</h1>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">ShadowChat</p>
                <h1 className="text-xl font-semibold text-[var(--text-primary)] md:text-2xl">Boards</h1>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden md:p-4">
        {activeBoard ? (
          <section className="glass-panel-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-x-0 border-y-0 border-[var(--border-panel)] md:rounded-[var(--radius-lg)] md:border">
            {renderActiveBoard()}
          </section>
        ) : (
          <BoardBubbleMap key={mapKey} countsByBoard={countsByBoard} onSelect={openBoard} />
        )}
      </main>
    </motion.div>
  )
}
