import { useRef } from 'react'
import { Button } from '../../../components/ui/Button'
import { InnerCircleSheet } from './InnerCircleSheet'

export function InnerCircleEditorSheet({
  open,
  mode,
  name,
  onNameChange,
  onSubmit,
  onClose,
  pending = false,
  error = null,
  maxNameLength = 40,
}: {
  open: boolean
  mode: 'create' | 'rename'
  name: string
  onNameChange: (name: string) => void
  onSubmit: () => void
  onClose: () => void
  pending?: boolean
  error?: string | null
  maxNameLength?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const title = mode === 'create' ? 'Create an Inner Circle' : 'Rename Inner Circle'
  const submitLabel = mode === 'create' ? 'Create Circle' : 'Save Name'
  const canSubmit = name.trim().length > 0 && !pending

  return (
    <InnerCircleSheet
      open={open}
      onClose={onClose}
      dismissible={!pending}
      title={title}
      eyebrow="Private list"
      description="Circle names and membership are visible only to you."
      initialFocusRef={inputRef as React.RefObject<HTMLElement>}
      testId="inner-circle-editor-sheet"
      footer={(
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" form="inner-circle-editor-form" loading={pending} disabled={!canSubmit}>{submitLabel}</Button>
        </div>
      )}
    >
      <form id="inner-circle-editor-form" onSubmit={event => { event.preventDefault(); if (canSubmit) onSubmit() }}>
        <label htmlFor="inner-circle-name" className="text-sm font-semibold text-[var(--text-primary)]">Circle name</label>
        <input
          ref={inputRef}
          id="inner-circle-name"
          value={name}
          onChange={event => onNameChange(event.target.value.slice(0, maxNameLength))}
          maxLength={maxNameLength}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="Closest friends"
          className="obsidian-input mt-2 h-12 w-full min-w-0 rounded-2xl px-4 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
        />
        <div className="mt-1 flex items-start justify-between gap-3 text-xs text-[var(--text-muted)]">
          <span>Use a name that will make sense to you later.</span>
          <span className="shrink-0" aria-label={`${name.length} of ${maxNameLength} characters`}>{name.length}/{maxNameLength}</span>
        </div>
        {error && <p role="alert" className="mt-3 rounded-[var(--radius-md)] border border-red-400/25 bg-red-950/20 p-3 text-sm text-red-100">{error}</p>}
      </form>
    </InnerCircleSheet>
  )
}
