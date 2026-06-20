import { readFileSync } from 'node:fs'
import path from 'node:path'

const readSource = (filePath: string) =>
  readFileSync(path.join(process.cwd(), filePath), 'utf8')

const sharedBridgeSource = readSource('supabase/functions/_shared/bridge.ts')
const bridgeGroupSendSource = readSource('supabase/functions/bridge-group-send/index.ts')
const bridgeDmSendSource = readSource('supabase/functions/bridge-dm-send/index.ts')
const bridgeDmPollSource = readSource('supabase/functions/bridge-dm-poll/index.ts')

const compact = (source: string) => source.replace(/\s+/g, ' ').toLowerCase()

describe('bridge service-role policy contract', () => {
  it('checks General Chat bans before privileged bridge group inserts', () => {
    const compactSource = compact(bridgeGroupSendSource)
    const banCheckIndex = compactSource.indexOf("supabase.rpc('is_user_channel_banned'")
    const insertIndex = compactSource.indexOf(".from('messages') .insert")
    const aiDispatchIndex = compactSource.indexOf('extractaimentionquestion(content)')

    expect(banCheckIndex).toBeGreaterThan(-1)
    expect(compactSource).toContain("scope: 'general_chat'")
    expect(compactSource).toContain('while banned from general chat')
    expect(insertIndex).toBeGreaterThan(-1)
    expect(aiDispatchIndex).toBeGreaterThan(-1)
    expect(banCheckIndex).toBeLessThan(insertIndex)
    expect(banCheckIndex).toBeLessThan(aiDispatchIndex)
  })

  it('limits bridge user search to DM-discoverable profiles', () => {
    const compactSource = compact(sharedBridgeSource)

    expect(compactSource).toContain('dm_discoverable')
    expect(compactSource).toContain(".eq('dm_discoverable', true)")
  })

  it('allows hidden DM recipients only when the bridge already has a conversation', () => {
    const compactSource = compact(sharedBridgeSource)

    expect(compactSource).toContain('userhasbridgedmconversation')
    expect(compactSource).toContain("from('dm_conversations')")
    expect(compactSource).toContain('allowexistingconversation')
    expect(compactSource).toContain('user.dm_discoverable === false')
  })

  it('passes bridge identity into DM recipient resolution from send and poll paths', () => {
    const compactSendSource = compact(bridgeDmSendSource)
    const compactPollSource = compact(bridgeDmPollSource)

    for (const source of [compactSendSource, compactPollSource]) {
      expect(source).toContain('resolvebridgeuserreference(supabase, recipientuserreference,')
      expect(source).toContain('requesteruserid: bridgeauth.auth.userid')
      expect(source).toContain('allowexistingconversation: true')
    }
  })
})
