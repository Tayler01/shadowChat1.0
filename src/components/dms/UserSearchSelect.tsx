import React from 'react'
import { Avatar } from '../ui/Avatar'
import { Input } from '../ui/Input'
import { useUserSearch } from '../../hooks/useUserSearch'
import { useAllUsers } from '../../hooks/useAllUsers'
import type { BasicUser } from '../../lib/supabase'

interface UserSearchSelectProps {
  value: string
  onChange: (value: string) => void
  onSelect: (user: BasicUser) => void
}

export const UserSearchSelect: React.FC<UserSearchSelectProps> = ({ value, onChange, onSelect }) => {
  const { results, loading, error } = useUserSearch(value)
  const { users: allUsers, loading: allLoading } = useAllUsers()
  const list = value ? results : allUsers
  const isLoading = value ? loading : allLoading
  return (
    <div className="relative">
      <Input
        placeholder="Enter username..."
        value={value}
        onChange={e => onChange(e.target.value)}
        className="text-sm"
      />
      {(value || list.length > 0) && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow max-h-60 overflow-y-auto">
          {isLoading && (
            <div className="p-2 text-sm text-gray-500">Loading...</div>
          )}
          {error && value && !isLoading && (
            <div className="p-2 text-sm text-red-500">{error}</div>
          )}
          {!isLoading && list.map(u => (
            <button
              key={u.id}
              onClick={() => onSelect(u)}
              className="w-full flex items-center px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <Avatar src={u.avatar_url} alt={u.display_name} size="sm" color={u.color} status={u.status} showStatus />
              <div className="ml-2">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.display_name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">@{u.username}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
