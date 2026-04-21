import React from 'react'
import { MessageSquare, Search } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { Input } from '../ui/Input'
import { useUserSearch } from '../../hooks/useUserSearch'
import { useAllUsers } from '../../hooks/useAllUsers'
import type { BasicUser } from '../../lib/supabase'

interface UserSearchSelectProps {
  value: string
  onChange: (value: string) => void
  onSelect: (user: BasicUser) => void | Promise<void>
  users?: BasicUser[]
  autoFocus?: boolean
  inlineResults?: boolean
  title?: string
  description?: string
  pendingUsername?: string | null
}

export const UserSearchSelect: React.FC<UserSearchSelectProps> = ({
  value,
  onChange,
  onSelect,
  users = [],
  autoFocus = false,
  inlineResults = false,
  title,
  description,
  pendingUsername = null,
}) => {
  const { results, loading, error } = useUserSearch(value)
  const { users: allUsers, loading: allLoading } = useAllUsers()
  const seedUsers = [...users, ...allUsers].filter(
    (user, index, arr) => arr.findIndex(candidate => candidate.id === user.id) === index
  )
  const normalizedValue = value.trim().toLowerCase()
  const localMatches = normalizedValue
    ? seedUsers.filter(user =>
        user.username.toLowerCase().includes(normalizedValue) ||
        user.display_name.toLowerCase().includes(normalizedValue)
      )
    : seedUsers
  const mergedResults = [...results, ...localMatches].filter(
    (user, index, arr) => arr.findIndex(candidate => candidate.id === user.id) === index
  )
  const prioritizedResults = normalizedValue
    ? mergedResults.sort((left, right) => {
        const leftExact = left.username.toLowerCase() === normalizedValue ? 1 : 0
        const rightExact = right.username.toLowerCase() === normalizedValue ? 1 : 0
        if (leftExact !== rightExact) {
          return rightExact - leftExact
        }

        const leftStarts = left.username.toLowerCase().startsWith(normalizedValue) ? 1 : 0
        const rightStarts = right.username.toLowerCase().startsWith(normalizedValue) ? 1 : 0
        return rightStarts - leftStarts
      })
    : seedUsers
  const list = normalizedValue ? prioritizedResults : seedUsers
  const isLoading = normalizedValue ? (loading && list.length === 0) : (allLoading && list.length === 0)
  const effectiveError = normalizedValue && !isLoading && list.length === 0
    ? (error || 'User not found')
    : null
  const panelClasses = inlineResults
    ? 'mt-3 max-h-[min(55vh,24rem)] w-full overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(7,8,9,0.84)] shadow-[var(--shadow-panel)] backdrop-blur-xl'
    : 'glass-panel absolute z-10 mt-2 max-h-60 w-full overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-panel)] shadow-[var(--shadow-panel)]'

  return (
    <div className="relative">
      {(title || description) && (
        <div className="mb-3 space-y-1">
          {title && (
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm text-[var(--text-muted)]">
              {description}
            </p>
          )}
        </div>
      )}
      <Input
        placeholder="Search by username"
        value={value}
        onChange={e => onChange(e.target.value)}
        helperText={!value ? 'Search once, tap a person, and jump straight into the DM.' : undefined}
        className="text-sm"
        autoFocus={autoFocus}
      />
      {(value || list.length > 0) && (
        <div className={panelClasses}>
          {inlineResults && (
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
              <span>{value ? 'Search results' : 'People you can message'}</span>
              <span>{list.length}</span>
            </div>
          )}
          {isLoading && (
            <div className="flex items-center gap-2 p-4 text-sm text-[var(--text-muted)]">
              <Search className="h-4 w-4" />
              Loading...
            </div>
          )}
          {effectiveError && normalizedValue && !isLoading && (
            <div className="p-4 text-sm text-red-300">{effectiveError}</div>
          )}
          {!isLoading && !effectiveError && list.length === 0 && (
            <div className="p-4 text-sm text-[var(--text-muted)]">
              No matches yet. Try a different username.
            </div>
          )}
          {!isLoading && list.map(u => {
            const isPending = pendingUsername === u.username

            return (
              <button
                key={u.id}
                type="button"
                onClick={() => void onSelect(u)}
                disabled={isPending}
                className="flex w-full items-center gap-3 border-b border-[rgba(255,255,255,0.04)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[rgba(255,255,255,0.05)] disabled:cursor-wait disabled:opacity-70"
              >
                <Avatar src={u.avatar_url} alt={u.display_name} size="sm" color={u.color} status={u.status} showStatus />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {u.display_name}
                      </div>
                      <div className="truncate text-xs text-[var(--text-muted)]">
                        @{u.username}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.08)] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-gold)]">
                      <MessageSquare className="h-3 w-3" />
                      {isPending ? 'Opening' : 'Start DM'}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
