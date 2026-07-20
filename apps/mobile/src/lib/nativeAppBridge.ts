import type { WebView } from 'react-native-webview';

import { getNotificationWebUrl, normalizeNotificationRoute } from './notifications/routes';
import type { NativeNotificationStage } from './notifications/stages';
export {
  parseNativeNotificationControlUrl,
  parseNativeWebMessage,
} from './nativeWebProtocol';
export type {
  NativeWebMessage,
  NativeWebSession,
} from './nativeWebProtocol';

export type { NativeNotificationStage } from './notifications/stages';

export type NativeNotificationBridgeState = {
  enabled: boolean;
  permission: 'granted' | 'denied' | 'undetermined' | 'unknown';
  busy: boolean;
  error: string | null;
  requestId: string | null;
  stage: NativeNotificationStage;
};

const buildNativeStateScript = (state: NativeNotificationBridgeState) => {
  const detail = JSON.stringify({
    version: 1,
    type: 'notifications_state',
    ...state,
  });

  return `
    window.dispatchEvent(new CustomEvent(
      'shadowchat:native-message',
      { detail: ${detail} }
    ));
    true;
  `;
};

export const publishNativeNotificationState = (
  webView: WebView | null,
  state: NativeNotificationBridgeState
) => {
  webView?.injectJavaScript(buildNativeStateScript(state));
};

type RouteListener = (url: string) => void;

let routeListener: RouteListener | null = null;
let pendingRoute: string | null = null;

export const publishNativeNotificationRoute = (route: string) => {
  const url = getNotificationWebUrl(normalizeNotificationRoute(route));
  if (routeListener) {
    routeListener(url);
  } else {
    pendingRoute = url;
  }
};

export const subscribeToNativeNotificationRoutes = (listener: RouteListener) => {
  routeListener = listener;
  if (pendingRoute) {
    const route = pendingRoute;
    pendingRoute = null;
    listener(route);
  }

  return () => {
    if (routeListener === listener) routeListener = null;
  };
};
