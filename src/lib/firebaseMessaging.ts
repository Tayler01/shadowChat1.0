import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, deleteToken } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: 'AIzaSyDwEGv1PRl9GLZwE-QdCnXCEiFn-fRPZt0',
  authDomain: 'shadowchat-99822.firebaseapp.com',
  projectId: 'shadowchat-99822',
  storageBucket: 'shadowchat-99822.firebasestorage.app',
  messagingSenderId: '255265121159',
  appId: '1:255265121159:web:4806c7207776bd5af9a922',
}

const app = initializeApp(firebaseConfig)
const messaging = getMessaging(app)

let registration: ServiceWorkerRegistration | null = null

async function ensureRegistration() {
  if (registration) return registration
  if ('serviceWorker' in navigator) {
    registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    return registration
  }
  throw new Error('Service workers are not supported in this browser')
}

export const requestPushPermission = async () => {
  try {
    const reg = await ensureRegistration()
    const token = await getToken(messaging, {
      vapidKey: 'BCJ5-S1a_rhX_QJqB3pRAykTCpWFv1IhmUd1NSL0GgYp7-X0GkyO00lXGfPd3hFMP7HOwDWNh6iIustKcSNlfS8',
      serviceWorkerRegistration: reg,
    })

    if (token) {
      console.log('Push token:', token)
      // TODO: Save token to Supabase `user_devices` table
    } else {
      console.log('No registration token available. Request permission to generate one.')
    }
  } catch (err) {
    console.error('An error occurred while retrieving token.', err)
  }
}

export const deletePushToken = async () => {
  try {
    await deleteToken(messaging)
  } catch (err) {
    console.error('Failed to delete push token', err)
  }
}

export const onForegroundMessage = (callback: (payload: any) => void) => {
  onMessage(messaging, callback)
}
