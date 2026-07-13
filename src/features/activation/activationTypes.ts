export type ActivationJourneyStep = 'identity' | 'preferences' | 'first_action' | 'complete'

export type ActivationJourneyUpdateStep =
  | 'identity'
  | 'preferences'
  | 'first_action'
  | 'install'
  | 'presentation'

export type ActivationNotificationChoice =
  | 'notifications_enabled'
  | 'notifications_later'
  | 'notifications_denied'
  | 'notifications_unsupported'

export type ActivationInstallChoice = 'installed' | 'later' | 'unsupported'

export type ActivationFirstActionKind =
  | 'group_message'
  | 'direct_message'
  | 'shadow_pin_heart'

export type ActivationPresentationState = 'expanded' | 'minimized'

/** Exact snake_case JSON returned by the Supabase activation RPCs. */
export type ActivationJourneyRpcRow = {
  user_id: string
  enrollment_source: 'invite_signup'
  identity_completed_at: string | null
  preferences_completed_at: string | null
  notification_choice: ActivationNotificationChoice | null
  comfort_reviewed_at: string | null
  selected_first_action_kind: ActivationFirstActionKind | null
  first_action_kind: ActivationFirstActionKind | null
  first_action_id: string | null
  first_action_completed_at: string | null
  install_choice: ActivationInstallChoice | null
  install_completed_at: string | null
  presentation_state: ActivationPresentationState
  dismissed_at: string | null
  revision: number
  enrolled_at: string
  updated_at: string
  completed_at: string | null
  current_step: ActivationJourneyStep
}

/** Camel-case application model expected after the API boundary normalizes an RPC row. */
export type ActivationJourney = {
  userId: string
  enrollmentSource: 'invite_signup'
  identityCompletedAt: string | null
  preferencesCompletedAt: string | null
  notificationChoice: ActivationNotificationChoice | null
  comfortReviewedAt: string | null
  selectedFirstActionKind: ActivationFirstActionKind | null
  firstActionKind: ActivationFirstActionKind | null
  firstActionId: string | null
  firstActionCompletedAt: string | null
  installChoice: ActivationInstallChoice | null
  installCompletedAt: string | null
  presentationState: ActivationPresentationState
  dismissedAt: string | null
  revision: number
  enrolledAt: string
  updatedAt: string
  completedAt: string | null
  currentStep: ActivationJourneyStep
}
