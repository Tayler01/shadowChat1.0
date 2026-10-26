import { readFileSync } from 'node:fs'
import path from 'node:path'

const source = readFileSync(
  path.join(process.cwd(), 'supabase/functions/openai-chat/index.ts'),
  'utf8'
)

const compactSource = source.replace(/\s+/g, ' ').toLowerCase()
const compactConfig = readFileSync(
  path.join(process.cwd(), 'supabase/config.toml'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()

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

  it('enforces an atomic hourly postToChat quota before provider calls', () => {
    expect(compactSource).toContain('ai_post_to_chat_hourly_limit')
    expect(compactSource).toContain("scope: 'openai-chat:post-hour'")
    expect(compactSource).toContain('consumeedgeratelimit(supabase')
    expect(compactSource).toContain('edgeratelimiterror')
  })

  it('validates postToChat before requesting an AI completion', () => {
    const validationIndex = compactSource.indexOf('validateposttochat(supabase, user.id, messages)')
    const requestIndex = compactSource.indexOf('requestaicompletion(messages, model, sharingconsent)')

    expect(validationIndex).toBeGreaterThan(-1)
    expect(requestIndex).toBeGreaterThan(-1)
    expect(validationIndex).toBeLessThan(requestIndex)
  })

  it('declares the manual JWT validation contract in Supabase config', () => {
    expect(compactConfig).toContain('[functions.openai-chat] verify_jwt = false')
  })

  it('returns metadata only after authenticated membership and validates reviewed configuration before claims or provider calls', () => {
    const authentication = compactSource.indexOf('await authenticateedgeuser(req)')
    const metadata = compactSource.indexOf("if (action === 'sharing-info') return json(sharinginfo)")
    const consent = compactSource.indexOf('validateaisharingconsent(sharingconsent, sharinginfo, messages, shouldposttochat)')
    const claim = compactSource.indexOf('const claim = await claimedgerequest(')
    expect(authentication).toBeGreaterThan(-1)
    expect(metadata).toBeGreaterThan(authentication)
    expect(consent).toBeGreaterThan(metadata)
    expect(claim).toBeGreaterThan(consent)
  })
})
