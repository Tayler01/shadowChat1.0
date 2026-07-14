import { supabase } from '../src/lib/supabase'
import { acknowledgeCatchUpEvents, fetchCatchUpSnapshot } from '../src/features/catch-up/catchUpApi'

jest.mock('../src/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}))

const rpc = supabase.rpc as jest.Mock

const emptySection = (id: string, title: string) => ({
  id,
  title,
  shown_count: 0,
  total_count: 0,
  has_more: false,
  older_unread_exists: false,
  items: [],
})

beforeEach(() => jest.clearAllMocks())

test('fetches the bounded seven-day deterministic snapshot contract', async () => {
  rpc.mockResolvedValue({
    data: {
      schema_version: 1,
      generated_at: '2026-07-14T02:00:00Z',
      effective_since: '2026-07-07T02:00:00Z',
      lookback_hours: 168,
      source_linked: true,
      ai_generated: false,
      sections: {
        needs_you: emptySection('needs_you', 'Needs you'),
        direct_messages: emptySection('direct_messages', 'Direct messages'),
        general_chat: emptySection('general_chat', 'General Chat'),
        shadow_pin: emptySection('shadow_pin', 'ShadowPin'),
      },
    },
    error: null,
  })

  await expect(fetchCatchUpSnapshot()).resolves.toMatchObject({ sourceLinked: true, aiGenerated: false })
  expect(rpc).toHaveBeenCalledWith('get_my_catch_up_v1', {
    section_limit: 6,
    lookback_hours: 168,
  })
})

test('deduplicates and bounds caller-owned Activity acknowledgements', async () => {
  rpc.mockResolvedValue({ data: 2, error: null })
  const ids = Array.from({ length: 55 }, (_, index) => `event-${index}`)
  ids.unshift('event-1')

  await expect(acknowledgeCatchUpEvents(ids)).resolves.toBe(2)
  expect(rpc).toHaveBeenCalledWith('acknowledge_my_catch_up_events', {
    target_event_ids: expect.any(Array),
  })
  const payload = rpc.mock.calls[0][1].target_event_ids as string[]
  expect(payload).toHaveLength(50)
  expect(new Set(payload).size).toBe(50)
})

test('rejects malformed backend snapshots instead of rendering invented content', async () => {
  rpc.mockResolvedValue({ data: { schema_version: 1, ai_generated: true }, error: null })
  await expect(fetchCatchUpSnapshot()).rejects.toThrow('invalid source snapshot')
})
