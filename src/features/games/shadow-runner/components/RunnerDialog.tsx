import React from 'react'
import { X } from 'lucide-react'
import { useDialogAccessibility } from '../../../../hooks/useDialogAccessibility'

export function RunnerDialog({ title, eyebrow, onClose, children, image }: {
  title: string
  eyebrow?: string
  onClose?: () => void
  children: React.ReactNode
  image?: string
}) {
  const ref = useDialogAccessibility({ open: true, onClose: onClose ?? (() => {}), dismissible: Boolean(onClose) })
  const titleId = React.useId()
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
