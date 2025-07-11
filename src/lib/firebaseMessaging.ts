import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, deleteToken } from 'firebase/messaging'
import { supabase } from './supabase'

let messaging: ReturnType<typeof getMessaging> | null = null
let vapidKey: string | null = null

async function initMessaging() {
  if (messaging) return messaging

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
  const functionsUrl = supabaseUrl
    ? supabaseUrl.replace('.supabase.co', '.functions.supabase.co')
    : ''

  const res = await fetch(`${functionsUrl}/firebase-config`)
  if (!res.ok) {
    throw new Error('Failed to load Firebase configuration')
  }

  const { firebaseConfig, vapidKey: key } = await res.json()
  const app = initializeApp(firebaseConfig)
  messaging = getMessaging(app)
  vapidKey = key || null
  return messaging
}

let registration: ServiceWorkerRegistration | null = null

async function ensureRegistration() {
  if (registration) return registration
  if ('serviceWorker' in navigator) {
    registration = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?supabaseUrl=${encodeURIComponent(import.meta.env.VITE_SUPABASE_URL)}`,
    )
    return registration
  }
  throw new Error('Service workers are not supported in this browser')
}

export const requestPushPermission = async () => {
  try {
    const [msg, reg] = await Promise.all([initMessaging(), ensureRegistration()])
    const token = await getToken(msg, {
      vapidKey: vapidKey || undefined,
      serviceWorkerRegistration: reg,
    })

    if (token) {
      console.log('Push token:', token)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('user_devices')
        .upsert(
          {
            user_id: user.id,
            token,
            platform: 'web',
            last_seen: new Date().toISOString(),
          },
          { onConflict: 'user_id,platform' },
        )

      if (error) {
        console.error('Error saving push token to Supabase', error)
      }
    } else {
      console.log('No registration token available. Request permission to generate one.')
    }
  } catch (err) {
    console.error('An error occurred while retrieving token.', err)
  }
}

export const deletePushToken = async () => {
  try {
    const msg = await initMessaging()
    await deleteToken(msg)
  } catch (err) {
    console.error('Failed to delete push token', err)
  }
}

export const onForegroundMessage = async (callback: (payload: any) => void) => {
  const msg = await initMessaging()
  onMessage(msg, callback)
}
