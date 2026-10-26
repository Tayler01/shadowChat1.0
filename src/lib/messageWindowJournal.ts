import {
  mergeRealtimeMessageUpdate,
  upsertMessageIntoState,
  type OptimisticMessageFields,
} from './optimisticMessages'

type WindowMessage = OptimisticMessageFields & { updated_at?: string }
type Mutation<T> = { kind: 'upsert'; message: T } | { kind: 'patch'; message: Partial<T> } | { kind: 'delete' }

/** Only events observed during one fetch are replayed over that fetch's snapshot. */
export function createMessageWindowJournal<T extends WindowMessage>() {
  const mutations = new Map<string, Mutation<T>>()
  let overflowed = false
  const record = (id: string, mutation: Mutation<T>) => {
    if (mutations.size >= 1000 && !mutations.has(id)) {
      overflowed = true
      return
    }
    mutations.set(id, mutation)
  }

  return {
    upsert(message: T) {
      // An INSERT hydration that finishes after DELETE must not resurrect a row.
      if (mutations.get(message.id)?.kind === 'delete') return false
      const previous = mutations.get(message.id)
      const merged = previous && previous.kind !== 'delete'
        ? mergeRealtimeMessageUpdate(message, previous.message) ?? message
        : message
      record(message.id, { kind: 'upsert', message: merged })
      return true
    },
    patch(message: Partial<T> & { id: string }) {
      const previous = mutations.get(message.id)
      if (previous?.kind === 'delete') return
      if (previous?.kind === 'upsert') {
        const merged = mergeRealtimeMessageUpdate(previous.message, message)
        if (merged) record(message.id, { kind: 'upsert', message: merged })
      } else {
        const previousTime = Date.parse(previous?.message.updated_at ?? '')
        const incomingTime = Date.parse(message.updated_at ?? '')
        if (Number.isFinite(previousTime) && Number.isFinite(incomingTime) && incomingTime < previousTime) return
        record(message.id, { kind: 'patch', message: { ...previous?.message, ...message } })
      }
    },
    remove(id: string) { record(id, { kind: 'delete' }) },
    replay(snapshot: T[], includeNewMessages = true) {
      // Keep the visible state if an unusually long request exceeded the bound;
      // the next refresh can obtain a fresh snapshot instead of dropping events.
      if (overflowed) throw new Error('Message refresh changed too quickly. Please refresh again.')
      let messages = snapshot
      for (const [id, mutation] of mutations) {
        if (mutation.kind === 'delete') {
          messages = messages.filter(message => message.id !== id)
          continue
        }
        const existing = messages.find(message => message.id === id)
        if (existing) {
          const merged = mergeRealtimeMessageUpdate(existing, mutation.message)
          if (merged) messages = upsertMessageIntoState(messages, merged)
        } else if (mutation.kind === 'upsert' && includeNewMessages) {
          messages = upsertMessageIntoState(messages, mutation.message)
        }
      }
      return messages
    },
  }
}
