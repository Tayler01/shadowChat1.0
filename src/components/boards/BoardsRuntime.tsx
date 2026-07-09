import type { ReactNode } from 'react'
import { BoardBadgesProvider, useBoardBadges } from '../../hooks/useBoardBadges'
import { useArtBoardReactionNotifications } from '../../hooks/useArtBoardReactionNotifications'

interface BoardsRuntimeProps {
  children: (boardsBadgeCount: number) => ReactNode
}

function BoardsRuntimeContent({ children }: BoardsRuntimeProps) {
  useArtBoardReactionNotifications()
  const { count } = useBoardBadges()
  return children(count)
}

export function BoardsRuntime({ children }: BoardsRuntimeProps) {
  return (
    <BoardBadgesProvider>
      <BoardsRuntimeContent>{children}</BoardsRuntimeContent>
    </BoardBadgesProvider>
  )
}
