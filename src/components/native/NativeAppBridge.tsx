import { useEffect } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

import { supabase } from '../../lib/supabase'
import {
  isNativeAppWebView,
  postNativeAppMessage,
} from '../../lib/nativeAppBridge'

export function NativeAppBridge() {
  useEffect(() => {
    if (!isNativeAppWebView()) return

    document.documentElement.dataset.shadowchatNativeApp = 'true'
    document.body.dataset.shadowchatNativeApp = 'true'

    const publishSession = (session: Session | null) => {
      if (
        !session?.access_token ||
        !session.refresh_token ||
        !session.user?.id
      ) {
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

    postNativeAppMessage({ version: 1, type: 'bridge_ready' })
    void supabase.auth.getSession().then((response: {
      data: { session: Session | null }
    }) => {
      publishSession(response.data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((
      _event: AuthChangeEvent,
      session: Session | null
    ) => {
      window.setTimeout(() => publishSession(session), 0)
    })

    return () => {
      subscription.unsubscribe()
      delete document.documentElement.dataset.shadowchatNativeApp
      delete document.body.dataset.shadowchatNativeApp
    }
  }, [])

  return null
}
