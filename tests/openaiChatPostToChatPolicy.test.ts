import { readFileSync } from 'node:fs'
import path from 'node:path'

const source = readFileSync(
  path.join(process.cwd(), 'supabase/functions/openai-chat/index.ts'),
  'utf8'
)

const compactSource = source.replace(/\s+/g, ' ').toLowerCase()

describe('openai-chat postToChat policy contract', () => {
  it('checks General Chat bans before privileged Shado message inserts', () => {
    expect(compactSource).toContain("supabase.rpc('is_user_channel_banned'")
    expect(compactSource).toContain("scope: 'general_chat'")
    expect(compactSource).toContain('while banned from general chat')
  })

  it('requires postToChat requests to match a recent caller-authored @ai command', () => {
    expect(compactSource).toContain('extractaicommandquestion')
    expect(compactSource).toContain('post_to_chat_recent_command_window_ms')
    expect(compactSource).toContain("from('messages')")
    expect(compactSource).toContain("eq('user_id', userid)")
    expect(compactSource).toContain('requires a recent @ai message from the requester')
  })

  it('enforces an hourly postToChat quota before provider calls', () => {
    expect(compactSource).toContain('ai_post_to_chat_hourly_limit')
    expect(compactSource).toContain("select('id', { count: 'exact', head: true })")
    expect(compactSource).toContain("content.ilike.@ai%,content.ilike.@shado%,content.ilike.@shado_ai%")
    expect(compactSource).toContain('toomanyrequests')
  })

  it('validates postToChat before requesting an AI completion', () => {
    const validationIndex = compactSource.indexOf('validateposttochat(supabase, id, messages)')
    const requestIndex = compactSource.indexOf('requestaicompletion(messages, model)')

    expect(validationIndex).toBeGreaterThan(-1)
    expect(requestIndex).toBeGreaterThan(-1)
    expect(validationIndex).toBeLessThan(requestIndex)
  })
})
