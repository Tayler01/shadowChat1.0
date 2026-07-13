import type { CreatorLocalDraft, ShadowPinCreatorState } from './creatorModel'
import { CREATOR_STEPS, serializeCreatorLocalDraft } from './creatorModel'

const PREFIX = 'shadowchat:shadow-pin-creator:v1'
const keyFor = (userId: string) => `${PREFIX}:${userId}`

export const saveCreatorLocalDraft = (userId: string, state: ShadowPinCreatorState) => {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(serializeCreatorLocalDraft(state)))
  } catch {
    // The owner-private server draft remains authoritative when device storage
    // is blocked, full, or unavailable in private browsing.
  }
}

export const loadCreatorLocalDraft = (userId: string): CreatorLocalDraft | null => {
  if (!userId || typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(keyFor(userId)) || 'null') as CreatorLocalDraft | null
    if (!parsed || !CREATOR_STEPS.includes(parsed.step)) return null
    return parsed
  } catch {
    return null
  }
}

export const clearCreatorLocalDraft = (userId: string) => {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(keyFor(userId))
  } catch {
    // Nonfatal: server state and expiry still govern the draft lifecycle.
  }
}
