import type { UserStatus } from '../types'

export type PresenceOption = {
  value: UserStatus
  label: string
  dotClass: string
  selectedClass: string
}

export const presenceOptions: PresenceOption[] = [
  {
    value: 'online',
    label: 'Online',
    dotClass: 'bg-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.55)]',
    selectedClass: 'border-[#22c55e]/70 bg-[#22c55e]/10 shadow-[0_0_0_1px_rgba(34,197,94,0.22),0_8px_24px_rgba(34,197,94,0.14)]',
  },
  {
    value: 'away',
    label: 'Away',
    dotClass: 'bg-[#facc15] shadow-[0_0_12px_rgba(250,204,21,0.48)]',
    selectedClass: 'border-[#facc15]/70 bg-[#facc15]/10 shadow-[0_0_0_1px_rgba(250,204,21,0.2),0_8px_24px_rgba(250,204,21,0.12)]',
  },
  {
    value: 'busy',
    label: 'Busy',
    dotClass: 'bg-[#ef4444] shadow-[0_0_12px_rgba(239,68,68,0.5)]',
    selectedClass: 'border-[#ef4444]/70 bg-[#ef4444]/10 shadow-[0_0_0_1px_rgba(239,68,68,0.22),0_8px_24px_rgba(239,68,68,0.12)]',
  },
  {
    value: 'offline',
    label: 'Offline',
    dotClass: 'bg-[#64748b] shadow-[0_0_10px_rgba(100,116,139,0.36)]',
    selectedClass: 'border-[#64748b]/70 bg-[#64748b]/10 shadow-[0_0_0_1px_rgba(100,116,139,0.2),0_8px_24px_rgba(100,116,139,0.1)]',
  },
]

export const getPresenceOption = (status?: UserStatus | null) =>
  presenceOptions.find(option => option.value === status) ?? presenceOptions[3]
