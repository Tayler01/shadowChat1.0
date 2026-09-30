export type MessageScrollAnchor = { id: string; offset: number }
const sessionAnchors = new Map<string, MessageScrollAnchor>()
export const getSavedMessageScrollAnchor = (readerId: string | null | undefined, surfaceKey: string) => (
  readerId ? sessionAnchors.get(`${readerId}:${surfaceKey}`) ?? null : null
)
export function saveMessageScrollAnchor(readerId: string | null | undefined, surfaceKey: string, anchor: MessageScrollAnchor | null) {
  if (!readerId) return
  if (!anchor) { sessionAnchors.delete(`${readerId}:${surfaceKey}`); return }
  sessionAnchors.set(`${readerId}:${surfaceKey}`, anchor)
  if (sessionAnchors.size > 150) sessionAnchors.delete(sessionAnchors.keys().next().value as string)
}

export function getMessageReadableViewport(container: HTMLElement) {
  const containerRect = container.getBoundingClientRect()
  const scrollPaddingTop = Number.parseFloat(window.getComputedStyle(container).scrollPaddingTop) || 0
  let bottom = containerRect.bottom
  // Each conversation owns its footer within the scrollport's parent. This
  // excludes an underlying General Chat footer when a thread sheet is open.
  const footer = container.parentElement?.querySelector<HTMLElement>('[data-mobile-chat-footer="true"]')
  if (footer) {
    const footerRect = footer.getBoundingClientRect()
    if (footerRect.height > 0 && footerRect.left < containerRect.right && footerRect.right > containerRect.left &&
      footerRect.top < bottom && footerRect.bottom > containerRect.top) {
      bottom = footerRect.top
    }
  }
  return { top: containerRect.top + scrollPaddingTop, bottom }
}

export function scrollMessageWithinContainer(container: HTMLElement, target: HTMLElement, block: 'start' | 'center' = 'start') {
  const rect = target.getBoundingClientRect()
  const viewport = getMessageReadableViewport(container)
  const targetTop = block === 'center'
    ? viewport.top + Math.max(0, (viewport.bottom - viewport.top - rect.height) / 2)
    : viewport.top
  container.scrollTop += rect.top - targetTop
}

export function captureMessageScrollAnchor(container: HTMLElement): MessageScrollAnchor | null {
  const top = container.getBoundingClientRect().top
  for (const row of container.querySelectorAll<HTMLElement>('[data-message-id], [data-thread-message-id]')) {
    const rect = row.getBoundingClientRect()
    if (rect.height > 0 && rect.bottom > top + 1) {
      const id = row.dataset.messageId ?? row.dataset.threadMessageId
      if (id) return { id, offset: rect.top - top }
    }
  }
  return null
}

export function restoreMessageScrollAnchor(container: HTMLElement, anchor: MessageScrollAnchor | null) {
  if (!anchor) return false
  const row = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id], [data-thread-message-id]'))
    .find(candidate => (candidate.dataset.messageId ?? candidate.dataset.threadMessageId) === anchor.id)
  if (!row) return false
  const delta = row.getBoundingClientRect().top - container.getBoundingClientRect().top - anchor.offset
  if (Math.abs(delta) > 0.5) container.scrollTop += delta
  return true
}
