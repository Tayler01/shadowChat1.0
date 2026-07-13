import {
  getMyActivationJourney,
  normalizeActivationJourney,
  updateMyActivationJourney,
} from '../src/features/activation/activationApi'
import { getWorkingClient } from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => ({ getWorkingClient: jest.fn() }))

const row = {
  user_id: 'user-1',
  enrollment_source: 'invite_signup',
  identity_completed_at: null,
  preferences_completed_at: null,
  notification_choice: null,
  comfort_reviewed_at: null,
  selected_first_action_kind: null,
  first_action_kind: null,
  first_action_id: null,
  first_action_completed_at: null,
  install_choice: null,
  install_completed_at: null,
  presentation_state: 'expanded',
  dismissed_at: null,
  revision: 1,
  enrolled_at: '2026-07-13T00:00:00Z',
  updated_at: '2026-07-13T00:00:00Z',
  completed_at: null,
  current_step: 'identity',
}

test('normalizes the owner journey and rejects unrelated or malformed rows', () => {
  expect(normalizeActivationJourney(row)).toMatchObject({
    userId: 'user-1',
    currentStep: 'identity',
    presentationState: 'expanded',
    revision: 1,
  })
  expect(normalizeActivationJourney(null)).toBeNull()
  expect(normalizeActivationJourney({ ...row, enrollment_source: 'legacy' })).toBeNull()
  expect(normalizeActivationJourney({ ...row, revision: 0 })).toBeNull()
})

test('fails closed when the enrollment RPC is missing or unavailable', async () => {
  ;(getWorkingClient as jest.Mock).mockResolvedValue({
    rpc: jest.fn().mockResolvedValue({ data: null, error: new Error('function missing') }),
  })
  await expect(getMyActivationJourney()).resolves.toBeUndefined()
})

test('uses revision-guarded updates without a client completion shortcut', async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: { ...row, revision: 2, presentation_state: 'minimized', dismissed_at: '2026-07-13T00:01:00Z' },
    error: null,
  })
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ rpc })
  const current = normalizeActivationJourney(row)!

  await expect(updateMyActivationJourney(current, 'presentation', 'minimized')).resolves.toMatchObject({ revision: 2, presentationState: 'minimized' })
  expect(rpc).toHaveBeenCalledWith('update_my_activation_journey', {
    target_expected_revision: 1,
    target_step: 'presentation',
    target_choice: 'minimized',
  })
  expect(rpc).not.toHaveBeenCalledWith('complete_my_activation_journey', expect.anything())
})
