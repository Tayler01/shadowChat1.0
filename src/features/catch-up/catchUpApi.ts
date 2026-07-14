import { supabase } from '../../lib/supabase'
import { normalizeCatchUpSnapshot, type CatchUpSnapshot } from './catchUpModel'

export async function fetchCatchUpSnapshot(): Promise<CatchUpSnapshot> {
  const { data, error } = await supabase.rpc('get_my_catch_up_v1', {
    section_limit: 6,
    lookback_hours: 168,
  })
  if (error) throw error
  const snapshot = normalizeCatchUpSnapshot(data)
  if (!snapshot) throw new Error('Catch-Up returned an invalid source snapshot.')
  return snapshot
}

export async function acknowledgeCatchUpEvents(eventIds: string[]) {
  if (eventIds.length === 0) return 0
  const { data, error } = await supabase.rpc('acknowledge_my_catch_up_events', {
    target_event_ids: [...new Set(eventIds)].slice(0, 50),
  })
  if (error) throw error
  return typeof data === 'number' ? data : Number(data ?? 0)
}
