import { useEffect } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

import {
  getStoredRefreshToken,
  supabase,
} from '../../lib/supabase'
import {
  isNativeAppWebView,
  postNativeAppMessage,
} from '../../lib/nativeAppBridge'

export function NativeAppBridge() {
  useEffect(() => {
    if (!isNativeAppWebView()) return

    document.documentElement.dataset.shadowchatNativeApp = 'true'
    document.body.dataset.shadowchatNativeApp = 'true'

    const publishSession = (
      session: Session | null,
      confirmedSignedOut = false,
    ) => {
      if (
        !session?.access_token ||
        !session.refresh_token ||
        !session.user?.id
      ) {
        if (!confirmedSignedOut && getStoredRefreshToken()) return
        postNativeAppMessage({
          version: 1,
          type: 'auth_session',
          session: null,
        })
        return
      }

      postNativeAppMessage({
        version: 1,
        type: 'auth_session',
        session: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: session.expires_at ?? null,
          userId: session.user.id,
        },
      })
    }

    void Promise.allSettled([
      navigator.serviceWorker?.getRegistrations?.()
        .then(registrations => Promise.all(
          registrations.map(registration => registration.unregister())
        )),
      typeof caches !== 'undefined'
        ? caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
        : Promise.resolve([]),
    ])

    postNativeAppMessage({ version: 1, type: 'bridge_ready' })
    let authEventVersion = 0
    void supabase.auth.getSession().then((response: {
      data: { session: Session | null }
    }) => {
      if (authEventVersion === 0) publishSession(response.data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((
      event: AuthChangeEvent,
      session: Session | null
    ) => {
      authEventVersion += 1
      window.setTimeout(() => {
        if (session) {
          publishSession(session)
          return
        }
        if (event === 'SIGNED_OUT' && !getStoredRefreshToken()) {
          publishSession(null, true)
        }
      }, 0)
    })

    return () => {
      subscription.unsubscribe()
      delete document.documentElement.dataset.shadowchatNativeApp
      delete document.body.dataset.shadowchatNativeApp
    }
  }, [])

  return null
}
