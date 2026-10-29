import { BRAND_MARK_URL } from '../brand'

interface StreamlinedLoadingViewProps {
  message?: string
  fullscreen?: boolean
  error?: string | null
}

/** Unknown network/module work is indeterminate; never invent a percentage. */
export function StreamlinedLoadingView({ message = 'Opening your community…', fullscreen = false, error }: StreamlinedLoadingViewProps) {
  return <div className={`streamlined-loading${fullscreen ? ' streamlined-loading--fullscreen' : ' streamlined-loading--compact'}`} role="status" aria-live="polite" aria-busy={!error}>
    <div className="streamlined-loading__content">
      <img src={BRAND_MARK_URL} alt="" width="96" height="96" className="streamlined-loading__mark" />
      <p className="streamlined-loading__name">ShadoChat</p>
      {!error && <div className="streamlined-loading__track" role="progressbar" aria-label={message} aria-valuetext="Loading"><span className="streamlined-loading__fill" /></div>}
      <p className="streamlined-loading__message">{error || message}</p>
    </div>
  </div>
}
