import { createClient } from '@supabase/supabase-js'
import { markDMMessagesReadThrough } from '../src/lib/supabase'

test('optimistic anchors never issue a receipt RPC or log conversation/message identifiers', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  const clientsBefore = (createClient as jest.Mock).mock.calls.length
  try {
    await expect(markDMMessagesReadThrough('10000000-0000-4000-8000-000000000001', 'local-secret-anchor'))
      .rejects.toMatchObject({ code: 'INVALID_ANCHOR' })
    expect((createClient as jest.Mock).mock.calls.length).toBe(clientsBefore)
    expect(warn).toHaveBeenCalledWith('DM read-through skipped', {
      operation: 'mark_dm_messages_read_through', code: 'INVALID_ANCHOR',
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('local-secret-anchor')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('10000000-0000-4000-8000-000000000001')
  } finally {
    warn.mockRestore()
  }
})
