import type { ReactNode } from 'react'
import { PresenceProvider } from './hooks/usePresence'
import { useAuth } from './hooks/useAuth'

export function PresenceRoot({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return <PresenceProvider userId={user?.id}>{children}</PresenceProvider>
}
