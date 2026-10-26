import { isNativeAppWebView } from '../lib/nativeAppBridge'

export function isLocalFeaturePreviewHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
}

/** Only the separate local artifact may skip the unavailable legal-receipt UI. */
export function isLocalFeaturePreview(): boolean {
  return typeof __SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ !== 'undefined'
    && __SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ === true
    && typeof window !== 'undefined'
    && isLocalFeaturePreviewHost(window.location.hostname)
    && !isNativeAppWebView()
    && document.querySelector('meta[name="shadowchat-local-feature-preview"][content="enabled"]') !== null
}
