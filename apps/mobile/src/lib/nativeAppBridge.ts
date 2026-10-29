import type { WebView } from 'react-native-webview';
import {requireCommunity} from '../community/communityBindings';

import { getNotificationWebUrl, normalizeNotificationRoute } from './notifications/routes';
import type { NativeNotificationStage } from './notifications/stages';
import type { BadgeDiagnostics } from './notifications/badgeDiagnostics';
import type { RouteDiagnostics } from './notifications/transportData';
export {
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
  badgeDiagnostics?: BadgeDiagnostics | null;
  routeDiagnostics?: RouteDiagnostics | null;
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

export const publishNativeNotificationEnrollmentChallenge = (
  webView: WebView | null,
  challenge: {
    requestId: string;
    installationKey: string;
    challenge: string;
    credentialChallenge: string;
  }
) => {
  const detail = JSON.stringify({
    version: 1,
    type: 'notification_enrollment_challenge',
    ...challenge,
  });
  webView?.injectJavaScript(`
    window.dispatchEvent(new CustomEvent(
      'shadowchat:native-message',
      { detail: ${detail} }
    ));
    true;
  `);
};

type RouteListener=(url:string)=>void;
let routeListener:{listener:RouteListener;context:ReturnType<typeof requireCommunity>}|null=null;
let pendingRoute:{url:string;context:ReturnType<typeof requireCommunity>}|null=null;
export const publishNativeNotificationRoute=(route:string)=>{
 const context=requireCommunity();const url=getNotificationWebUrl(normalizeNotificationRoute(route));
 if(routeListener?.context===context)routeListener.listener(url);else pendingRoute={url,context};
};
export const subscribeToNativeNotificationRoutes=(listener:RouteListener)=>{
 const context=requireCommunity();const subscription={listener,context};routeListener=subscription;
 if(pendingRoute?.context===context)listener(pendingRoute.url);pendingRoute=null;
 return()=>{if(routeListener===subscription)routeListener=null;};
};
