import React from 'react'
import { Cloud, CloudOff, HardDrive, Info, RotateCcw } from 'lucide-react'
import type { ShadowRunnerProgressSnapshot } from '../progress'
import { RunnerDialog } from './RunnerDialog'

export function RunnerSaveStatus({ progress, onRetry, onDetailsChange }: {
  progress: ShadowRunnerProgressSnapshot
  onRetry: () => void
  onDetailsChange: (open: boolean) => void
}) {
  const [details, setDetails] = React.useState(false)
  const changeDetails = (open: boolean) => { setDetails(open); onDetailsChange(open) }
  const failed = Boolean(progress.syncError || progress.storageError)
  const guest = !progress.progress.ownerId
  const label = failed ? 'Save needs attention' : progress.status === 'loading' ? 'Restoring progress' : progress.pendingCount ? 'Saving result' : guest ? 'Saved on this device' : 'Account progress synced'
  return (
    <>
      <footer className="runner-save-status" data-failed={failed}>
        {failed ? <CloudOff size={16} /> : guest ? <HardDrive size={16} /> : <Cloud size={16} />}
        <span role="status">{label}</span>
        <button type="button" className="runner-save-details" onClick={() => changeDetails(true)} title="Save details" aria-label="Save details"><Info size={17} /></button>
      </footer>
      {details && <RunnerDialog title="Save details" onClose={() => changeDetails(false)}>
        <p>{guest ? 'Guest progress stays on this device. It is not credited to an account.' : 'Completed chapters sync to your account. Full-clear and perfect-route records stay on this device.'}</p>
        {progress.pendingCount > 0 && <p>{progress.pendingCount} result(s) waiting to sync.</p>}
        {progress.syncError && <p role="alert">{progress.syncError}</p>}
        {progress.storageError && <p role="alert">{progress.storageError}</p>}
        {progress.hasLegacyArchive && <p>Your older device progress is preserved in the guest archive.</p>}
        {failed && <button type="button" className="runner-command" onClick={onRetry}><RotateCcw size={18} />Retry save</button>}
      </RunnerDialog>}
    </>
  )
}
