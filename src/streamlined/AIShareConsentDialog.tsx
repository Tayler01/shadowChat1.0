import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../components/ui/Button'
import { useDialogAccessibility } from '../hooks/useDialogAccessibility'
import { getAISharingInfo, type AIShareRequest, type AISharingInfo, type ApprovedAIShare } from '../../apps/streamlined/src-overrides/lib/ai'

interface AIShareConsentDialogProps {
  request: AIShareRequest
  onDecision: (approved: ApprovedAIShare | null) => void
}

export function AIShareConsentDialog({ request, onDecision }: AIShareConsentDialogProps) {
  const [info, setInfo] = useState<AISharingInfo | null>(null)
  const [error, setError] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const decidedRef = useRef(false)
  const decide = (approved: ApprovedAIShare | null) => {
    if (decidedRef.current) return
    decidedRef.current = true
    onDecision(approved)
  }
  const dialogRef = useDialogAccessibility({ open: true, onClose: () => decide(null) })

  useEffect(() => {
    let active = true
    // Only provider configuration is requested here; no message text leaves the device.
    void getAISharingInfo().then(result => { if (active) setInfo(result) }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [])

  const sharedMessages = info ? request.messages.slice(0, info.maxMessages).map(message => ({ ...message, content: message.content.slice(0, info.maxContentLength) })) : []
  const textMessages = sharedMessages.filter(message => message.role === 'user')
  const approve = () => {
    if (!info) return
    decide({ request: { ...request, messages: sharedMessages }, consent: { configurationKey: info.configurationKey, scope: request.scope } })
  }

  return createPortal(<div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[var(--bg-shell)] text-[var(--text-primary)] shadow-[var(--shadow-panel)]">
      <div className="min-h-0 overflow-y-auto overscroll-contain p-5">
        <h2 id={titleId} className="text-xl font-semibold">Share text with AI?</h2>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Review the recipient and text before this request. Cancel keeps your draft and sends nothing to AI.</p>
        {!info && !error && <p role="status" className="mt-4 text-sm text-[var(--text-muted)]">Checking the AI service...</p>}
        {error && <p role="alert" className="mt-4 text-sm leading-6 text-[var(--text-gold)]">The AI service details could not be verified. Nothing has been shared. Cancel and try again later.</p>}
        {info && <div className="mt-4 space-y-4 text-sm leading-6">
          <div className="rounded-[var(--radius-sm)] border border-[var(--border-panel)] bg-[var(--bg-panel)] p-3">
            <p><strong>Recipient:</strong> {info.provider === 'openrouter' ? 'OpenRouter and the model hosting provider it selects' : 'OpenAI'}.</p>
            <p className="break-words"><strong>Model:</strong> {info.model}</p>
            {info.provider === 'openrouter' && <p className="mt-2 text-[var(--text-muted)]">OpenRouter chooses the hosting provider for this request; the host can vary.</p>}
          </div>
          <p>{request.scope === 'question' ? 'Your question below is shared, together with a fixed instruction to answer it.' : `The text of ${textMessages.length} recent loaded messages from this conversation is shared, together with a fixed instruction to summarize it.`} Names, account IDs and media files are not added, but anything written in the text, including names or links, is shared.</p>
          <p>{request.postToChat ? 'Your question and Shado’s answer will appear in General Chat.' : 'The result will be sent in this conversation under your account.'}</p>
          <div className="space-y-3">
            <h3 className="font-semibold">Text to share</h3>
            {textMessages.map((message, index) => <pre key={index} className="whitespace-pre-wrap break-words rounded-[var(--radius-sm)] border border-[var(--border-panel)] bg-[var(--bg-panel)] p-3 font-sans text-sm">{message.content || '(empty text)'}</pre>)}
            <details className="text-[var(--text-secondary)]"><summary className="min-h-11 cursor-pointer py-2 text-[var(--theme-accent-readable)]">Fixed AI instruction</summary><p className="whitespace-pre-wrap break-words">{sharedMessages.find(message => message.role === 'system')?.content}</p></details>
          </div>
          <a href="/?legal=privacy" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-[var(--theme-accent-readable)] underline underline-offset-4">Privacy policy</a>
        </div>}
      </div>
      <div className="flex shrink-0 flex-col gap-3 border-t border-[var(--border-panel)] p-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={() => decide(null)} className="min-h-12">Cancel</Button>
        <Button type="button" disabled={!info || error} onClick={approve} className="min-h-12">Share with AI</Button>
      </div>
    </section>
  </div>, document.body)
}
