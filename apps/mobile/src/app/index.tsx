import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview';

import { useNativeNotifications } from '@/hooks/useNativeNotifications';
import {
  parseNativeWebMessage,
  publishNativeNotificationState,
  subscribeToNativeNotificationRoutes,
} from '@/lib/nativeAppBridge';
import { getNotificationWebUrl } from '@/lib/notifications/routes';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

const APP_ORIGIN = 'https://shadochat.online';
const APP_URL = getNotificationWebUrl('/?nativeApp=1');
const NATIVE_BOOTSTRAP_SCRIPT = `
  (function () {
    window.__SHADOWCHAT_NATIVE_APP__ = true;
    if (document.documentElement) {
      document.documentElement.dataset.shadowchatNativeApp = 'true';
    }

    var storageKey = 'sb-shsqqouecvdoifzufkqm-auth-token';
    var lastSessionFingerprint = null;

    function postToNative(message) {
      if (
        window.ReactNativeWebView &&
        typeof window.ReactNativeWebView.postMessage === 'function'
      ) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }
    }

    function readWebSession() {
      try {
        var raw = window.localStorage.getItem(storageKey);
        if (!raw) return null;
        var stored = JSON.parse(raw);
        var session = stored && (
          stored.currentSession ||
          stored.session ||
          stored
        );
        if (
          !session ||
          typeof session.access_token !== 'string' ||
          typeof session.refresh_token !== 'string' ||
          !session.user ||
          typeof session.user.id !== 'string'
        ) {
          return null;
        }
        return {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: typeof session.expires_at === 'number'
            ? session.expires_at
            : null,
          userId: session.user.id
        };
      } catch (_) {
        return null;
      }
    }

    function publishWebSession() {
      var session = readWebSession();
      var fingerprint = session
        ? session.userId + ':' + session.accessToken.slice(-16)
        : 'signed-out';
      if (fingerprint === lastSessionFingerprint) return;
      lastSessionFingerprint = fingerprint;
      postToNative({
        version: 1,
        type: 'auth_session',
        session: session
      });
    }

    postToNative({ version: 1, type: 'bridge_ready' });
    publishWebSession();
    window.addEventListener('storage', publishWebSession);
    window.setInterval(publishWebSession, 1200);
  })();
  true;
`;

const isAllowedAppUrl = (value: string) => {
  if (value === 'about:blank') return true;
  try {
    return new URL(value).origin === APP_ORIGIN;
  } catch {
    return false;
  }
};

const sameSession = (
  current: Session | null,
  next: { accessToken: string; refreshToken: string; userId: string }
) =>
  current?.access_token === next.accessToken &&
  current.refresh_token === next.refreshToken &&
  current.user.id === next.userId;

function ConfigurationNotice() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centeredPanel}>
        <Text style={styles.brand}>ShadoChat</Text>
        <Text selectable style={styles.errorText}>
          This build is missing its public Supabase configuration.
        </Text>
      </View>
    </SafeAreaView>
  );
}

export default function ShadowChatAppScreen() {
  const webViewRef = useRef<WebView>(null);
  const authSyncRef = useRef<Promise<void> | null>(null);
  const nativeNotifications = useNativeNotifications();
  const [webReady, setWebReady] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [nativeUserId, setNativeUserId] = useState<string | null>(null);
  const [notificationPromptDismissed, setNotificationPromptDismissed] =
    useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const notificationState = useMemo(() => ({
    enabled: nativeNotifications.enabled,
    permission: nativeNotifications.permission,
    busy: nativeNotifications.busy,
    error: nativeNotifications.error,
  }), [
    nativeNotifications.busy,
    nativeNotifications.enabled,
    nativeNotifications.error,
    nativeNotifications.permission,
  ]);

  const publishNotificationState = useCallback(() => {
    publishNativeNotificationState(webViewRef.current, notificationState);
  }, [notificationState]);

  useEffect(() => {
    if (!webReady) return;
    publishNotificationState();
  }, [publishNotificationState, webReady]);

  const navigateInsideApp = useCallback((url: string) => {
    if (!isAllowedAppUrl(url)) return;
    const serializedUrl = JSON.stringify(url);
    webViewRef.current?.injectJavaScript(`
      window.location.assign(${serializedUrl});
      true;
    `);
  }, []);

  useEffect(
    () => subscribeToNativeNotificationRoutes(navigateInsideApp),
    [navigateInsideApp]
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!canGoBack) return false;
        webViewRef.current?.goBack();
        return true;
      }
    );
    return () => subscription.remove();
  }, [canGoBack]);

  const syncNativeSession = useCallback(async (
    nextSession: {
      accessToken: string;
      refreshToken: string;
      userId: string;
    } | null
  ) => {
    const prior = authSyncRef.current;
    if (prior) await prior.catch(() => undefined);

    const sync = (async () => {
      const client = getSupabase();
      const { data } = await client.auth.getSession();
      const current = data.session;

      if (!nextSession) {
        if (current) {
          const { error } = await client.auth.signOut({ scope: 'local' });
          if (error) throw error;
        }
        setNativeUserId(null);
        return;
      }

      if (!sameSession(current, nextSession)) {
        const { data: sessionData, error } = await client.auth.setSession({
          access_token: nextSession.accessToken,
          refresh_token: nextSession.refreshToken,
        });
        if (error) throw error;
        if (sessionData.session?.user.id !== nextSession.userId) {
          throw new Error('The native session did not match the signed-in account.');
        }
      }

      setNativeUserId(nextSession.userId);
      setBridgeError(null);
    })();

    authSyncRef.current = sync;
    try {
      await sync;
    } finally {
      if (authSyncRef.current === sync) authSyncRef.current = null;
    }
  }, []);

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    const message = parseNativeWebMessage(event.nativeEvent.data);
    if (!message) return;

    try {
      if (message.type === 'auth_session') {
        await syncNativeSession(message.session);
        return;
      }
      if (message.type === 'notifications_enable') {
        await syncNativeSession(message.session);
        await nativeNotifications.enable();
        return;
      }
      if (message.type === 'notifications_disable') {
        await nativeNotifications.disableThisDevice();
        return;
      }
      if (message.type === 'notifications_open_settings') {
        await Linking.openSettings();
        return;
      }
      if (
        message.type === 'bridge_ready' ||
        message.type === 'native_state_request'
      ) {
        publishNotificationState();
      }
    } catch (caught) {
      const messageText = caught instanceof Error
        ? caught.message
        : 'Native app synchronization failed.';
      setBridgeError(messageText);
      publishNativeNotificationState(webViewRef.current, {
        ...notificationState,
        busy: false,
        error: messageText,
      });
    }
  }, [
    nativeNotifications,
    notificationState,
    publishNotificationState,
    syncNativeSession,
  ]);

  const handleNavigationChange = useCallback((navigation: WebViewNavigation) => {
    setCanGoBack(navigation.canGoBack);
  }, []);

  const handleNavigationRequest = useCallback((request: { url: string }) => {
    if (isAllowedAppUrl(request.url)) return true;
    if (
      request.url.startsWith('mailto:') ||
      request.url.startsWith('tel:') ||
      request.url.startsWith('sms:') ||
      request.url.startsWith('https://')
    ) {
      void Linking.openURL(request.url);
    }
    return false;
  }, []);

  const showNotificationPrompt =
    Boolean(nativeUserId) &&
    !nativeNotifications.enabled &&
    !notificationPromptDismissed;

  if (!isSupabaseConfigured) {
    return <ConfigurationNotice />;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <WebView
        key={reloadKey}
        ref={webViewRef}
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        applicationNameForUserAgent="ShadoChatNative/1.0"
        automaticallyAdjustContentInsets={false}
        bounces={false}
        contentInsetAdjustmentBehavior="never"
        decelerationRate="normal"
        injectedJavaScriptBeforeContentLoaded={NATIVE_BOOTSTRAP_SCRIPT}
        javaScriptCanOpenWindowsAutomatically={false}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        onContentProcessDidTerminate={() => setReloadKey(value => value + 1)}
        onError={(event) => {
          setLoadError(
            event.nativeEvent.description || 'Could not load ShadoChat.'
          );
        }}
        onHttpError={(event) => {
          if (event.nativeEvent.statusCode >= 500) {
            setLoadError(`ShadoChat returned ${event.nativeEvent.statusCode}.`);
          }
        }}
        onLoadEnd={() => {
          setWebReady(true);
          setLoadError(null);
          publishNotificationState();
        }}
        onLoadStart={() => setWebReady(false)}
        onMessage={(event) => {
          void handleMessage(event);
        }}
        onNavigationStateChange={handleNavigationChange}
        onShouldStartLoadWithRequest={handleNavigationRequest}
        originWhitelist={['https://*', 'about:blank']}
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        source={{ uri: APP_URL }}
        startInLoadingState
        style={styles.webView}
        thirdPartyCookiesEnabled
        renderLoading={() => (
          <View style={styles.loadingLayer}>
            <ActivityIndicator color="#E9C766" size="large" />
            <Text style={styles.loadingText}>Opening ShadoChat</Text>
          </View>
        )}
      />

      {loadError ? (
        <SafeAreaView pointerEvents="box-none" style={styles.blockingLayer}>
          <View style={styles.errorCard}>
            <Text style={styles.cardEyebrow}>Connection interrupted</Text>
            <Text style={styles.cardTitle}>ShadoChat could not load</Text>
            <Text selectable style={styles.cardBody}>{loadError}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setLoadError(null);
                setReloadKey(value => value + 1);
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : null}

      {showNotificationPrompt ? (
        <SafeAreaView pointerEvents="box-none" style={styles.promptLayer}>
          <View style={styles.promptCard}>
            <View style={styles.promptCopy}>
              <Text style={styles.cardEyebrow}>Native alerts</Text>
              <Text style={styles.promptTitle}>
                {nativeNotifications.permission === 'denied'
                  ? 'Notifications are off in iPhone Settings'
                  : 'Turn on the full ShadoChat experience'}
              </Text>
              <Text style={styles.promptBody}>
                Get rich messages, ShadowPin previews, game turns, custom
                sounds, badges, and exact tap-through destinations.
              </Text>
              {bridgeError || nativeNotifications.error ? (
                <Text selectable style={styles.inlineError}>
                  {bridgeError || nativeNotifications.error}
                </Text>
              ) : null}
            </View>
            <View style={styles.promptActions}>
              <Pressable
                accessibilityRole="button"
                disabled={nativeNotifications.busy}
                onPress={() => {
                  if (nativeNotifications.permission === 'denied') {
                    void Linking.openSettings();
                  } else {
                    void nativeNotifications.enable();
                  }
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  nativeNotifications.busy && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {nativeNotifications.busy ? (
                  <ActivityIndicator color="#050505" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {nativeNotifications.permission === 'denied'
                      ? 'Open Settings'
                      : 'Enable Notifications'}
                  </Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setNotificationPromptDismissed(true)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Not Now</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      ) : null}

      {!showNotificationPrompt && bridgeError ? (
        <SafeAreaView pointerEvents="box-none" style={styles.noticeLayer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setBridgeError(null)}
            style={styles.notice}
          >
            <Text numberOfLines={2} style={styles.noticeText}>{bridgeError}</Text>
            <Text style={styles.noticeDismiss}>×</Text>
          </Pressable>
        </SafeAreaView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050505',
  },
  webView: {
    flex: 1,
    backgroundColor: '#050505',
  },
  loadingLayer: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#050505',
  },
  loadingText: {
    color: '#A69B82',
    fontSize: 14,
    fontWeight: '600',
  },
  centeredPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  brand: {
    color: '#F7E7B2',
    fontSize: 34,
    fontWeight: '800',
  },
  errorText: {
    color: '#F3A19D',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  blockingLayer: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 5, 5, 0.92)',
    padding: 20,
  },
  errorCard: {
    width: '100%',
    maxWidth: 460,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(233, 199, 102, 0.28)',
    borderRadius: 24,
    backgroundColor: '#101112',
    padding: 22,
  },
  cardEyebrow: {
    color: '#E9C766',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: '#F7F0DE',
    fontSize: 24,
    fontWeight: '800',
  },
  cardBody: {
    color: '#A69B82',
    fontSize: 15,
    lineHeight: 22,
  },
  promptLayer: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
  },
  promptCard: {
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(233, 199, 102, 0.38)',
    borderRadius: 24,
    backgroundColor: 'rgba(13, 14, 15, 0.98)',
    padding: 18,
    boxShadow: '0 18px 46px rgba(0, 0, 0, 0.58)',
  },
  promptCopy: {
    gap: 5,
  },
  promptTitle: {
    color: '#F7F0DE',
    fontSize: 18,
    fontWeight: '800',
  },
  promptBody: {
    color: '#A69B82',
    fontSize: 13,
    lineHeight: 19,
  },
  inlineError: {
    marginTop: 5,
    color: '#F3A19D',
    fontSize: 12,
    lineHeight: 17,
  },
  promptActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#E9C766',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#050505',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(233, 199, 102, 0.28)',
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#F7E7B2',
    fontSize: 14,
    fontWeight: '800',
  },
  noticeLayer: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 8,
  },
  notice: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(243, 161, 157, 0.38)',
    borderRadius: 16,
    backgroundColor: 'rgba(35, 18, 18, 0.97)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noticeText: {
    flex: 1,
    color: '#F3C4C0',
    fontSize: 12,
    lineHeight: 17,
  },
  noticeDismiss: {
    color: '#F3C4C0',
    fontSize: 24,
    fontWeight: '300',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
});
