import { getWorkingClient } from '../../lib/supabase'
import type {
  ActivationFirstActionKind,
  ActivationInstallChoice,
  ActivationJourney,
  ActivationJourneyRpcRow,
  ActivationJourneyUpdateStep,
  ActivationNotificationChoice,
  ActivationPresentationState,
} from './activationTypes'

type ActivationChoice =
  | ActivationNotificationChoice
  | ActivationInstallChoice
  | ActivationFirstActionKind
  | ActivationPresentationState
  | null

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
)
const stringOrNull = (value: unknown) => typeof value === 'string' && value ? value : null

export const normalizeActivationJourney = (value: unknown): ActivationJourney | null => {
  const raw = record(Array.isArray(value) ? value[0] : value) as Partial<ActivationJourneyRpcRow>
  if (typeof raw.user_id !== 'string' || raw.enrollment_source !== 'invite_signup') return null
  if (!['identity', 'preferences', 'first_action', 'complete'].includes(String(raw.current_step))) return null
  if (!['expanded', 'minimized'].includes(String(raw.presentation_state))) return null
  const revision = Number(raw.revision)
  if (!Number.isInteger(revision) || revision < 1) return null

  return {
    userId: raw.user_id,
    enrollmentSource: 'invite_signup',
    identityCompletedAt: stringOrNull(raw.identity_completed_at),
    preferencesCompletedAt: stringOrNull(raw.preferences_completed_at),
    notificationChoice: (stringOrNull(raw.notification_choice) as ActivationNotificationChoice | null),
    comfortReviewedAt: stringOrNull(raw.comfort_reviewed_at),
    selectedFirstActionKind: (stringOrNull(raw.selected_first_action_kind) as ActivationFirstActionKind | null),
    firstActionKind: (stringOrNull(raw.first_action_kind) as ActivationFirstActionKind | null),
    firstActionId: stringOrNull(raw.first_action_id),
    firstActionCompletedAt: stringOrNull(raw.first_action_completed_at),
    installChoice: (stringOrNull(raw.install_choice) as ActivationInstallChoice | null),
    installCompletedAt: stringOrNull(raw.install_completed_at),
    presentationState: raw.presentation_state as ActivationPresentationState,
    dismissedAt: stringOrNull(raw.dismissed_at),
    revision,
    enrolledAt: String(raw.enrolled_at || ''),
    updatedAt: String(raw.updated_at || ''),
    completedAt: stringOrNull(raw.completed_at),
    currentStep: raw.current_step as ActivationJourney['currentStep'],
  }
}

export async function getMyActivationJourney(): Promise<ActivationJourney | null | undefined> {
  try {
    const client = await getWorkingClient()
    const { data, error } = await client.rpc('get_my_activation_journey')
    if (error) return undefined
    if (data == null) return null
    return normalizeActivationJourney(data) ?? undefined
  } catch {
    // Keep unavailable backend state distinct from a successful unenrolled
    // lookup so launch can retry without showing either onboarding surface.
    return undefined
  }
}

export async function updateMyActivationJourney(
  journey: Pick<ActivationJourney, 'revision'>,
  step: ActivationJourneyUpdateStep,
  choice: ActivationChoice = null
): Promise<ActivationJourney> {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('update_my_activation_journey', {
    target_expected_revision: journey.revision,
    target_step: step,
    target_choice: choice,
  })
  if (error) throw error
  const updated = normalizeActivationJourney(data)
  if (!updated) throw new Error('Activation journey returned an invalid response.')
  return updated
}
