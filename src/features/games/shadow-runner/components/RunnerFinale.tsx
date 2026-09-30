import React from 'react'
import { ChevronRight, RotateCcw, SkipForward } from 'lucide-react'
import { useDialogAccessibility } from '../../../../hooks/useDialogAccessibility'
import type { ShadowRunnerFinaleConfig } from '../game/levels'

export function RunnerFinale({ finale, beatIndex, reducedMotion, onAdvance, onComplete }: {
  finale: ShadowRunnerFinaleConfig
  beatIndex: number
  reducedMotion: boolean
  onAdvance: () => void
  onComplete: () => void
}) {
  const ref = useDialogAccessibility({ open: true, onClose: onComplete, dismissible: false })
  const headingId = React.useId()
  const bodyId = React.useId()
  const beat = finale.beats[beatIndex]
  const asset = beat?.asset ?? finale.asset
  const [failedAsset, setFailedAsset] = React.useState<string | null>(null)
  const [imageAttempt, setImageAttempt] = React.useState(0)
  const last = beatIndex >= finale.beats.length - 1

  if (!beat) return null

  return (
    <section ref={ref} role="dialog" aria-modal="true" aria-label="Dawn Relay Spire finale"
      aria-describedby={bodyId} tabIndex={-1} className="runner-finale" data-reduced-motion={reducedMotion}>
      {failedAsset !== asset && <img key={`${asset}:${imageAttempt}`} className="runner-finale-scene"
        src={asset} alt="" draggable={false} onError={() => setFailedAsset(asset)} />}
      <div className="runner-finale-shade" />
      <button type="button" className="runner-icon-command runner-finale-skip" title="Skip cinematic"
        aria-label="Skip cinematic" onClick={onComplete}><SkipForward size={20} aria-hidden="true" /></button>
      <div className="runner-finale-caption">
        <div className="runner-finale-story" aria-live="polite" aria-atomic="true">
          <p className="runner-eyebrow">{beat.eyebrow}</p>
          <h2 id={headingId}>{beat.title}</h2>
          <p id={bodyId}>{beat.body}</p>
        </div>
        <div className="runner-finale-footer">
          <ol className="runner-finale-progress" aria-label="Ending chapters">
            {finale.beats.map((item, index) => <li key={item.title} aria-label={item.title}
              aria-current={index === beatIndex ? 'step' : undefined} data-complete={index <= beatIndex} />)}
          </ol>
          {failedAsset === asset && <button type="button" className="runner-icon-command"
            title="Reload scene artwork" aria-label="Reload scene artwork"
            onClick={() => { setFailedAsset(null); setImageAttempt(current => current + 1) }}><RotateCcw size={18} aria-hidden="true" /></button>}
          <button type="button" className="runner-command" onClick={last ? onComplete : onAdvance}>
            {last ? 'View Results' : beat.actionLabel ?? 'Continue'}<ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}
