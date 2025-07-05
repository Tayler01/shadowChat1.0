import React, { createContext, useContext } from 'react'
import type { ClientResetStatus } from './useClientResetStatus'
import { useClientResetStatus } from './useClientResetStatus'

interface ClientResetContextValue {
  status: ClientResetStatus
  lastResetTime: Date | null
  manualReset: () => Promise<void>
}

const ClientResetContext = createContext<ClientResetContextValue | undefined>(undefined)

export function ClientResetProvider({ children }: { children: React.ReactNode }) {
  const value = useClientResetStatus()
  return <ClientResetContext.Provider value={value}>{children}</ClientResetContext.Provider>
}

export function useClientReset() {
  const ctx = useContext(ClientResetContext)
  if (!ctx) {
    throw new Error('useClientReset must be used within a ClientResetProvider')
  }
  return ctx
}
