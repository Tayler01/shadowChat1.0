import { useRef } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useDialogAccessibility } from '../../../../hooks/useDialogAccessibility'
import type { ShadoLiveTerminalReason } from './shadoLiveModel'

export function ShadoLiveTerminalDialog({
  reason,
  message,
  onReturn,
}: {
  reason: ShadoLiveTerminalReason
  message: string
  onReturn: () => void
}) {
  const primaryRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogAccessibility<HTMLDivElement>({
    open: true,
    onClose: () => undefined,
    initialFocusRef: primaryRef,
  })
  const title = reason === 'ended'
    ? 'This room has ended'
    : reason === 'removed'
      ? 'You left the room'
      : reason === 'replaced'
        ? 'Room opened elsewhere'
        : reason === 'ineligible'
          ? 'Room access changed'
          : 'Media connection ended'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/82 p-5 backdrop-blur-md">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="shado-live-terminal-title" aria-describedby="shado-live-terminal-description" className="w-full max-w-sm rounded-[1.75rem] border border-[#d7aa46]/30 bg-[#0d0c0a] p-6 text-center shadow-[0_28px_90px_rgba(0,0,0,0.7)]">
        <ShieldCheck className="mx-auto h-8 w-8 text-[#e8bd58]" aria-hidden="true" />
        <h2 id="shado-live-terminal-title" className="mt-4 text-xl font-bold text-white">{title}</h2>
        <p id="shado-live-terminal-description" className="mt-2 text-sm leading-6 text-[#aaa397]">{message}</p>
        <button ref={primaryRef} type="button" onClick={onReturn} className="mt-5 min-h-12 w-full rounded-xl bg-[#d7aa46] text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-[#f4d985] focus:ring-offset-2 focus:ring-offset-black">Back to Shado Live</button>
      </div>
    </div>
  )
}
