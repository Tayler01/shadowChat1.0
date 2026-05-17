import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { motion } from 'framer-motion'
import { BoardBubbleMap } from './BoardBubbleMap'
import { BoardChat } from './BoardChat'
import { ArtBoard, ArtBoardAboutDialog } from '../art/ArtBoard'
import { NewsFeed } from '../news/NewsFeed'
import { Button } from '../ui/Button'
import { MobileAppHeader } from '../layout/MobileAppHeader'
import { cn } from '../../lib/utils'
import type { BoardDefinition } from '../../lib/boards'
import { useBoardBadges } from '../../hooks/useBoardBadges'
import type { AppView } from '../../types/navigation'

interface BoardsViewProps {
  resetKey?: number
  currentView?: AppView
  onViewChange?: (view: AppView) => void
  onMobileChatActiveChange?: (active: boolean) => void
}

export function BoardsView({
  resetKey = 0,
  currentView = 'boards',
  onViewChange = () => {},
  onMobileChatActiveChange,
}: BoardsViewProps) {
  const [activeBoard, setActiveBoard] = useState<BoardDefinition | null>(null)
  const [mapKey, setMapKey] = useState(0)
  const [artAboutOpen, setArtAboutOpen] = useState(false)
  const { countsByBoard, markFeedSeen } = useBoardBadges()
  const hasActiveChatBoard = activeBoard?.kind === 'chat'
  const suppressMobileNav = hasActiveChatBoard

  useEffect(() => {
    setActiveBoard(null)
    setMapKey(value => value + 1)
  }, [resetKey])

  useEffect(() => {
    if (activeBoard?.slug === 'news-feed') {
      void markFeedSeen()
    }
  }, [activeBoard?.slug, markFeedSeen])

  useEffect(() => {
    onMobileChatActiveChange?.(suppressMobileNav)
    return () => onMobileChatActiveChange?.(false)
  }, [onMobileChatActiveChange, suppressMobileNav])

  const openBoard = (board: BoardDefinition) => {
    onMobileChatActiveChange?.(board.kind === 'chat')
    setArtAboutOpen(false)
    setActiveBoard(board)
  }

  const closeBoard = () => {
    onMobileChatActiveChange?.(false)
    setArtAboutOpen(false)
    setActiveBoard(null)
    setMapKey(value => value + 1)
  }

  const renderActiveBoard = () => {
    if (!activeBoard) return null

    if (activeBoard.kind === 'chat') {
      return (
        <BoardChat
          board={activeBoard}
          currentView={currentView}
          onViewChange={onViewChange}
        />
      )
    }

    if (activeBoard.kind === 'feed') {
      return <NewsFeed />
    }

    if (activeBoard.slug === 'art-board') {
      return <ArtBoard />
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
      className={cn(
        'theme-image-surface relative flex h-full min-h-0 flex-col text-sm',
        suppressMobileNav ? 'pb-0' : 'pb-[calc(env(safe-area-inset-bottom)_+_4.2rem)] md:pb-0'
      )}
    >
      <MobileAppHeader
        currentView={currentView}
        onViewChange={onViewChange}
        title={activeBoard?.title || 'Boards'}
        eyebrow={activeBoard ? 'Boards' : undefined}
        logo={!activeBoard}
        onBack={activeBoard ? closeBoard : undefined}
        backLabel="Back to boards"
        collapseOnKeyboard={hasActiveChatBoard}
      />

      {activeBoard?.slug === 'art-board' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setArtAboutOpen(true)}
          className="absolute left-3 top-[calc(env(safe-area-inset-top)_+_3.85rem)] z-40 h-11 w-11 rounded-full p-0 md:left-4"
          aria-label="About Art Board"
        >
          <Info className="h-4 w-4" />
        </Button>
      )}

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden md:p-4">
        {activeBoard ? (
          <section className={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent',
            'rounded-none border-x-0 border-y-0 border-[var(--border-panel)] md:rounded-[var(--radius-lg)] md:border'
          )}>
            {renderActiveBoard()}
          </section>
        ) : (
          <BoardBubbleMap key={mapKey} countsByBoard={countsByBoard} onSelect={openBoard} />
        )}
      </main>

      {artAboutOpen && <ArtBoardAboutDialog onClose={() => setArtAboutOpen(false)} />}
    </motion.div>
  )
}
