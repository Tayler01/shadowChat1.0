import { Flame, Heart, Lightbulb, Sparkles } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { ART_BOARD_REACTIONS } from '../../lib/artBoard'
import type { ArtBoardReaction, User } from '../../lib/supabase'

const reactionIconMap: Record<ArtBoardReaction, typeof Heart> = {
  heart: Heart,
  spark: Sparkles,
  fire: Flame,
  idea: Lightbulb,
}

const getReactionLabel = (reaction: ArtBoardReaction) =>
  ART_BOARD_REACTIONS.find(entry => entry.id === reaction)?.label ?? 'Reacted'

const getActorName = (actor?: Partial<User> | null) =>
  actor?.display_name || actor?.username || 'Someone'

export function ArtReactionNotification({
  actor,
  reaction,
  itemTitle,
}: {
  actor?: Partial<User> | null
  reaction: ArtBoardReaction
  itemTitle: string
}) {
  const Icon = reactionIconMap[reaction] ?? Sparkles

  return (
    <div className="glass-panel-strong flex max-w-sm items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-glow)] px-3 py-2 shadow-[var(--shadow-panel-strong)]">
      <Avatar
        src={actor?.avatar_url}
        alt={getActorName(actor)}
        color={actor?.color}
        userId={actor?.id}
        presenceVisibility={actor?.presence_visibility}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{getActorName(actor)}</p>
        <p className="truncate text-xs text-[var(--text-secondary)]">
          {getReactionLabel(reaction)} on {itemTitle}
        </p>
      </div>
      <Icon className="h-4 w-4 shrink-0 text-[var(--text-gold)]" />
    </div>
  )
}
