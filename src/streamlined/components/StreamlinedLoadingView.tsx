import { BRAND_MARK_URL } from '../brand'

interface StreamlinedLoadingViewProps {
  message?: string
  fullscreen?: boolean
  error?: string | null
  progress?: number
}

/** Unknown network/module work is indeterminate; never invent a percentage. */
export function StreamlinedLoadingView({ message = 'Opening your community…', fullscreen = false, error, progress }: StreamlinedLoadingViewProps) {
  const measured = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : undefined
  return <div className={`streamlined-loading${fullscreen ? ' streamlined-loading--fullscreen' : ' streamlined-loading--compact'}`} role="status" aria-live="polite" aria-busy={!error}>
    <div className="streamlined-loading__content">
      <img src={BRAND_MARK_URL} alt="" width="96" height="96" className="streamlined-loading__mark" />
      <p className="streamlined-loading__name">ShadoChat</p>
      {!error && <div className="streamlined-loading__track" role="progressbar" aria-label={message} aria-valuetext={measured === undefined ? 'Loading' : 'Completed startup work'} aria-valuenow={measured === undefined ? undefined : Math.round(measured * 100)} aria-valuemin={0} aria-valuemax={100}><span className={`streamlined-loading__fill${measured === undefined ? '' : ' streamlined-work-fill'}`} style={measured === undefined ? undefined : { width: '100%', marginInline: 0, animation: 'none', transformOrigin: 'left center', transform: `scaleX(${measured})`, transition: measured === 1 ? 'none' : 'transform 160ms linear' }} /></div>}
      <p className="streamlined-loading__message">{error || message}</p>
    </div>
  </div>
}
