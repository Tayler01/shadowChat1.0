import { isNativeAppWebView, postNativeAppMessage } from '../lib/nativeAppBridge'

declare global {
  interface Window {
    __SHADOWCHAT_NATIVE_COMMUNITY_CHOOSER__?: boolean
  }
}

// Older installed builds keep their existing native chooser until updated.
export const canChangeNativeCommunity = () => isNativeAppWebView()
  && (window.__SHADOWCHAT_NATIVE_COMMUNITY_CHOOSER__ === true
    || Number(new URLSearchParams(window.location.search).get('nativeBridge')) >= 4)

export const requestNativeCommunityChooser = () => canChangeNativeCommunity()
  && postNativeAppMessage({ version: 1, type: 'community_choose' })
