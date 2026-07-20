import type { WebView } from 'react-native-webview';

import { getNotificationWebUrl, normalizeNotificationRoute } from './notifications/routes';
import type { NativeNotificationStage } from './notifications/stages';

export type NativeWebSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  userId: string;
};

export type NativeWebMessage =
  | { version: 1; type: 'bridge_ready' }
  | { version: 1; type: 'auth_session'; session: NativeWebSession | null }
  | {
      version: 1;
      type: 'notifications_enable';
      requestId: string | null;
      session: NativeWebSession | null;
    }
  | { version: 1; type: 'notifications_disable'; requestId: string | null }
  | { version: 1; type: 'notifications_open_settings' }
  | { version: 1; type: 'native_state_request' };

export type { NativeNotificationStage } from './notifications/stages';

export type NativeNotificationBridgeState = {
  enabled: boolean;
  permission: 'granted' | 'denied' | 'undetermined' | 'unknown';
  busy: boolean;
  error: string | null;
  requestId: string | null;
  stage: NativeNotificationStage;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseSession = (value: unknown): NativeWebSession | null | undefined => {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  if (
    typeof value.accessToken !== 'string' ||
    value.accessToken.length < 20 ||
    typeof value.refreshToken !== 'string' ||
    value.refreshToken.length < 20 ||
    typeof value.userId !== 'string' ||
    value.userId.length < 16 ||
    (
      value.expiresAt !== null &&
      typeof value.expiresAt !== 'number'
    )
  ) {
    return undefined;
  }

  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: value.expiresAt as number | null,
    userId: value.userId,
  };
};

export const parseNativeWebMessage = (raw: string): NativeWebMessage | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(value) || value.version !== 1 || typeof value.type !== 'string') {
    return null;
  }

  if (
    value.type === 'bridge_ready' ||
    value.type === 'notifications_open_settings' ||
    value.type === 'native_state_request'
  ) {
    return { version: 1, type: value.type };
  }

  if (value.type === 'notifications_disable') {
    return {
      version: 1,
      type: 'notifications_disable',
      requestId: typeof value.requestId === 'string' ? value.requestId : null,
    };
  }

  if (value.type === 'auth_session') {
    const session = parseSession(value.session);
    if (session === undefined) return null;
    return { version: 1, type: 'auth_session', session };
  }

  if (value.type === 'notifications_enable') {
    const session = parseSession(value.session);
    if (session === undefined) return null;
    return {
      version: 1,
      type: 'notifications_enable',
      requestId: typeof value.requestId === 'string' ? value.requestId : null,
      session,
    };
  }

  return null;
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
