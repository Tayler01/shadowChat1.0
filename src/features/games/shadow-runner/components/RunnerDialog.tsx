import React from 'react'
import { X } from 'lucide-react'
import { useDialogAccessibility } from '../../../../hooks/useDialogAccessibility'

import { RunnerDialogSuspensionContext } from './runnerDialogSuspension'

export function RunnerDialog({ title, eyebrow, onClose, children, image, suspended }: {
  title: string
  eyebrow?: string
  onClose?: () => void
  children: React.ReactNode
  image?: string
  suspended?: boolean
}) {
  const inheritedSuspension = React.useContext(RunnerDialogSuspensionContext)
  const inactive = suspended ?? inheritedSuspension
  const ref = useDialogAccessibility({ open: !inactive, onClose: onClose ?? (() => {}), dismissible: Boolean(onClose), restoreFocus: !inactive })
  const titleId = React.useId()
  if (inactive) return null
  return (
    <div className={`runner-dialog-backdrop${image ? ' runner-dialog-cinematic' : ''}`}>
      {image && <img className="runner-dialog-scene" src={image} alt="" draggable={false} />}
      <section ref={ref} className="runner-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="runner-dialog-heading">
          <div>{eyebrow && <p className="runner-eyebrow">{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div>
          {onClose && <button type="button" className="runner-icon-command" title="Close" aria-label="Close dialog" onClick={onClose}><X size={20} aria-hidden="true" /></button>}
        </header>
        {children}
      </section>
    </div>
  )
}
