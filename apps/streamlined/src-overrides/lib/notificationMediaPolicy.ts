import { createCommunityNotificationMediaUrlPolicy } from '../../../../src/features/notifications/notificationEnvelopeV2'
import {
  VITE_APP_DEPLOY_CONTEXT,
  VITE_NOTIFICATION_APP_ORIGIN,
  VITE_SUPABASE_URL,
} from './env'

// These values come from the isolated build, never from notification data.
// A broken demo configuration deliberately returns a deny-all policy.
export const streamlinedNotificationMediaUrlPolicy = VITE_APP_DEPLOY_CONTEXT === 'review-demo'
  ? createCommunityNotificationMediaUrlPolicy(VITE_NOTIFICATION_APP_ORIGIN, VITE_SUPABASE_URL)
  : undefined
