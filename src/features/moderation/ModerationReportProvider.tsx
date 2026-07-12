import React, { useCallback, useMemo, useState } from 'react'
import type { ModerationReportTarget } from '../../lib/moderationCases'
import { ModerationReportContext } from './moderationReportContext'

const MemberReportSheet = React.lazy(() =>
  import('./MemberReportSheet').then(module => ({ default: module.MemberReportSheet }))
)

export function ModerationReportProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<ModerationReportTarget | null>(null)
  const closeReport = useCallback(() => setTarget(null), [])
  const openReport = useCallback((nextTarget: ModerationReportTarget) => setTarget(nextTarget), [])
  const value = useMemo(() => ({ openReport, closeReport }), [closeReport, openReport])

  return (
    <ModerationReportContext.Provider value={value}>
      {children}
      {target && (
        <React.Suspense fallback={null}>
          <MemberReportSheet target={target} onClose={closeReport} />
        </React.Suspense>
      )}
    </ModerationReportContext.Provider>
  )
}
