export const VITE_DEBUG_LOGS = import.meta.env.VITE_DEBUG_LOGS
export const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const VITE_WEB_PUSH_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY
export const VITE_APP_BUILD_ID = import.meta.env.VITE_APP_BUILD_ID
export const VITE_APP_COMMIT_SHA = import.meta.env.VITE_APP_COMMIT_SHA
export const VITE_APP_DEPLOY_CONTEXT = import.meta.env.VITE_APP_DEPLOY_CONTEXT
export const VITE_NOTIFICATION_APP_ORIGIN = import.meta.env.VITE_NOTIFICATION_APP_ORIGIN
export const VITE_APP_IS_PROD = import.meta.env.PROD
export const VITE_APP_MODE = import.meta.env.MODE
export const VITE_SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
export const VITE_SUPABASE_IMAGE_TRANSFORMS_ENABLED =
  import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORMS_ENABLED
// Enable only after the private Storage policy/client rollout gates pass.
export const VITE_PRIVATE_MEDIA_ENABLED = import.meta.env.VITE_PRIVATE_MEDIA_ENABLED
// Public origin only, required if the managed Bunny library uses a custom CDN hostname.
export const VITE_BUNNY_STREAM_CDN_ORIGIN = import.meta.env.VITE_BUNNY_STREAM_CDN_ORIGIN
// Enable for all web editions only after private Realtime policies are installed.
export const VITE_PRIVATE_REALTIME_ENABLED = import.meta.env.VITE_PRIVATE_REALTIME_ENABLED
