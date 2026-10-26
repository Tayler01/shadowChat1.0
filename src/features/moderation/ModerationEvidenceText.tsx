import type { ModerationTargetType } from '../../lib/moderationCases'

function firstText(snapshot: Record<string, unknown>, ...fields: string[]) {
  for (const field of fields) {
    const value = snapshot[field]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

export function ModerationEvidenceText({ snapshot, targetType }: {
  snapshot: Record<string, unknown>
  targetType: ModerationTargetType
}) {
  let fields: string[]
  if (targetType === 'shadow_pin_image') {
    fields = [firstText(snapshot, 'title'), firstText(snapshot, 'description')]
  } else if (targetType === 'user') {
    const username = firstText(snapshot, 'username')
    fields = [
      firstText(snapshot, 'displayName', 'display_name'),
      username ? `@${username}` : '',
      firstText(snapshot, 'statusMessage', 'status_message'),
    ]
  } else if (targetType === 'shadow_pin_comment') {
    fields = [firstText(snapshot, 'body', 'comment')]
  } else {
    fields = [firstText(snapshot, 'content', 'message', 'caption', 'comment', 'display_name')]
  }

  const text = fields.filter(Boolean).join('\n\n') || 'Evidence snapshot captured'
  // Render text only. Source media URLs are not case-authorized evidence copies.
  return <p className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.18)] p-4 text-sm leading-6 text-[var(--text-secondary)]">{text}</p>
}
