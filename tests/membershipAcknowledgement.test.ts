import { acceptStreamlinedMembership, getStreamlinedMembershipAcknowledgement, STREAMLINED_POLICY_VERSION } from '../src/streamlined/membershipAcknowledgement'
import { getWorkingClient } from '../apps/streamlined/src-overrides/lib/supabase'

jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({ getWorkingClient: jest.fn() }))
const rpc = jest.fn()
const row = { user_id: 'member-1', policy_version: STREAMLINED_POLICY_VERSION, adult_declared: true, terms_accepted: true, privacy_acknowledged: true, accepted_at: '2026-10-22T20:00:00Z' }
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getWorkingClient).mockResolvedValue({ rpc } as unknown as Awaited<ReturnType<typeof getWorkingClient>>)
  rpc.mockResolvedValue({ data: [row], error: null })
})
test('reads only the owner RPC and validates its receipt', async () => {
  expect(await getStreamlinedMembershipAcknowledgement('member-1')).toEqual({ userId: 'member-1', policyVersion: STREAMLINED_POLICY_VERSION, adultDeclared: true, termsAccepted: true, privacyAcknowledged: true, acceptedAt: row.accepted_at })
  expect(rpc).toHaveBeenCalledWith('get_streamlined_membership_acknowledgement')
  rpc.mockResolvedValueOnce({ data: [], error: null })
  expect(await getStreamlinedMembershipAcknowledgement('member-1')).toBeNull()
})
test('pins the expected account and version without a browser timestamp', async () => {
  await acceptStreamlinedMembership({ userId: 'member-1', adultDeclared: true, termsAccepted: true, privacyAcknowledged: true })
  expect(rpc).toHaveBeenCalledWith('accept_streamlined_membership', { p_expected_user_id: 'member-1', p_policy_version: STREAMLINED_POLICY_VERSION, p_adult_declared: true, p_terms_accepted: true, p_privacy_acknowledged: true })
})
test.each(['adultDeclared', 'termsAccepted', 'privacyAcknowledged'])('rejects missing %s before a request', async field => {
  await expect(acceptStreamlinedMembership({ userId: 'member-1', adultDeclared: true, termsAccepted: true, privacyAcknowledged: true, [field]: false })).rejects.toThrow(/Confirm/)
  expect(rpc).not.toHaveBeenCalled()
})
test.each([{ ...row, user_id: 'member-2' }, { ...row, policy_version: 'outdated' }, { ...row, adult_declared: false }, { ...row, accepted_at: 'invalid' }])('rejects an invalid server receipt', async value => {
  rpc.mockResolvedValueOnce({ data: [value], error: null })
  await expect(getStreamlinedMembershipAcknowledgement('member-1')).rejects.toThrow()
})
test('does not downgrade missing backend or save confirmation to local acceptance', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
  await expect(getStreamlinedMembershipAcknowledgement('member-1')).rejects.toThrow(/Could not check/)
  rpc.mockResolvedValueOnce({ data: null, error: null })
  await expect(acceptStreamlinedMembership({ userId: 'member-1', adultDeclared: true, termsAccepted: true, privacyAcknowledged: true })).rejects.toThrow(/not confirmed/)
})
