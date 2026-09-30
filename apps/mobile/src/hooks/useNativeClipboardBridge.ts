import { requireOptionalNativeModule } from 'expo';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import type { RefObject } from 'react';
import type { WebView } from 'react-native-webview';
import { createNativeClipboardController, type NativeClipboardApi } from '../lib/nativeClipboardController';

export function useNativeClipboardBridge(webViewRef: RefObject<WebView | null>, origin: string) {
  const clipboard = useMemo(() => Platform.OS === 'ios' ? requireOptionalNativeModule<NativeClipboardApi>('ShadowChatClipboard') : null, []);
  const controller = useMemo(() => createNativeClipboardController({
    origin,
    clipboard,
    publish: message => {
      const detail = JSON.stringify(message);
      webViewRef.current?.injectJavaScript(`if(window.location.origin===${JSON.stringify(origin)}){window.dispatchEvent(new CustomEvent('shadowchat:native-message',{detail:${detail}}));}true;`);
    },
  }), [clipboard, origin, webViewRef]);
  useEffect(() => () => controller.reset(), [controller]);
  return useMemo(() => ({ ...controller, available: Boolean(clipboard) }), [clipboard, controller]);
}
