import { useContext } from 'react'
import { ModerationReportContext } from './moderationReportContext'

export function useModerationReport() {
  return useContext(ModerationReportContext)
}
