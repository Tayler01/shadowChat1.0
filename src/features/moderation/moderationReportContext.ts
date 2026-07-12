import { createContext } from 'react'
import type { ModerationReportTarget } from '../../lib/moderationCases'

export type ModerationReportContextValue = {
  openReport: (target: ModerationReportTarget) => void
  closeReport: () => void
}

export const ModerationReportContext = createContext<ModerationReportContextValue>({
  openReport: () => undefined,
  closeReport: () => undefined,
})
