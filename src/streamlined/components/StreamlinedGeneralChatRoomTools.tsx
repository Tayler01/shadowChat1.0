import { useMemo, useState } from 'react'
import { Search, SearchCheck } from 'lucide-react'
import { PinnedMessagesButton } from '../../components/chat/PinnedMessagesButton'
import { useOptionalMessages } from '../../../apps/streamlined/src-overrides/hooks/MessagesContext'

interface GeneralChatRoomToolsProps {
  onSearch: (query: string, scope: 'messages' | 'all') => void
}

/** Revealed by scrolling toward older chat; uses the existing discovery search. */
export function GeneralChatRoomTools({ onSearch }: GeneralChatRoomToolsProps) {
  const messagesContext = useOptionalMessages()
  const [query, setQuery] = useState('')
  const pinnedMessages = useMemo(
    () => (messagesContext?.messages || []).filter(message => message.pinned),
    [messagesContext?.messages]
  )

  return (
    <div role="search" aria-label="Group chat search" className="border-b border-[var(--border-panel)] bg-[var(--bg-shell)] px-3 pb-1.5 pt-2 shadow-[0_8px_18px_rgba(0,0,0,0.16)]">
      <form className="flex min-w-0 items-center gap-2" onSubmit={event => { event.preventDefault(); onSearch(query, 'messages') }}>
        <label htmlFor="streamlined-chat-search" className="sr-only">Search chat messages</label>
        <input id="streamlined-chat-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search chat messages" enterKeyHint="search" className="obsidian-input h-11 min-w-0 flex-1 rounded-full px-4 text-base" />
        <button type="submit" aria-label="Search messages" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--theme-accent-readable)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"><Search className="h-5 w-5" aria-hidden="true" /></button>
      </form>
      <div role="group" aria-label="General Chat tools" className="mt-1 flex min-h-11 items-center justify-between gap-2">
        <button type="button" onClick={() => onSearch(query, 'all')} className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-xs text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"><SearchCheck className="h-4 w-4" aria-hidden="true" />Full search & saved</button>
        <PinnedMessagesButton
          messages={pinnedMessages}
          onUnpin={messagesContext?.togglePin ?? (async () => {})}
          onToggleReaction={messagesContext?.toggleReaction ?? (async () => {})}
        />
      </div>
    </div>
  )
}
