import type { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { configureNativeNotifications } from '@/lib/notifications/config';
import {
  getNativeNotificationInstallationKey,
  registerNativeNotificationInstallation,
  revokeNativeNotificationInstallation,
  updateNativeNotificationForegroundLease,
} from '@/lib/notifications/registration';
import { normalizeNotificationRoute } from '@/lib/notifications/routes';
import {
  parseNotificationEnvelopeV2,
  type NotificationEnvelopeV2,
} from '@/types/notification-envelope-v2';

type NativeNotificationsContextValue = {
  enabled: boolean;
  permission: Notifications.PermissionStatus | 'unknown';
  busy: boolean;
  error: string | null;
  enable: () => Promise<void>;
  disableThisDevice: () => Promise<void>;
};

const NativeNotificationsContext =
  createContext<NativeNotificationsContextValue | null>(null);

const revokeInstallationWithSession = async (session: Session) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return false;

  const installationKey = await getNativeNotificationInstallationKey();
  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/revoke_my_notification_installation_v2`,
    {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target_installation_key: installationKey }),
    }
  );
  if (!response.ok) {
    throw new Error(`Notification installation revocation failed (${response.status}).`);
  }
  return true;
};

const getEnvelopeFromNotification = (
  notification: Notifications.Notification
) => {
  const data = notification.request.content.data ?? {};
  return parseNotificationEnvelopeV2(
    data.envelopeV2 ??
    data.notificationEnvelopeV2 ??
    data
  );
};

function NativeNotificationBanner({
  envelope,
  onDismiss,
  onOpen,
}: {
  envelope: NotificationEnvelopeV2;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  const insets = useSafeAreaInsets();
  const actor = envelope.privacy === 'private' ? null : envelope.actor;
  const body = envelope.privacy === 'full'
    ? envelope.content.body
    : 'Open ShadowChat to view it.';

  return (
    <View pointerEvents="box-none" style={[styles.bannerLayer, { top: insets.top + 10 }]}>
      <View accessibilityLiveRegion="polite" style={styles.banner}>
        {actor?.avatarUrl ? (
          <Image accessibilityIgnoresInvertColors source={{ uri: actor.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>
              {(actor?.label ?? 'S').slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        <Pressable
          accessibilityLabel={`${envelope.content.title}. Open notification.`}
          accessibilityRole="button"
          onPress={onOpen}
          style={({ pressed }) => [styles.bannerContent, pressed && styles.pressed]}
        >
          <Text style={styles.eyebrow}>{envelope.content.eyebrow}</Text>
          <Text numberOfLines={1} style={styles.bannerTitle}>{envelope.content.title}</Text>
          {body ? <Text numberOfLines={2} style={styles.bannerBody}>{body}</Text> : null}
        </Pressable>
        {envelope.privacy === 'full' && envelope.media?.thumbnailUrl ? (
          <Pressable accessibilityRole="button" onPress={onOpen}>
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: envelope.media.thumbnailUrl }}
              style={styles.media}
            />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Dismiss notification"
          accessibilityRole="button"
          onPress={onDismiss}
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
        >
          <Text style={styles.dismissText}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function NativeNotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] =
    useState<Notifications.PermissionStatus | 'unknown'>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<NotificationEnvelopeV2 | null>(null);
  const handledResponseIds = useRef(new Set<string>());
  const sessionRef = useRef<Session | null>(null);
  const registrationInFlightRef = useRef<Promise<unknown> | null>(null);

  const openEnvelope = useCallback((envelope: NotificationEnvelopeV2) => {
    setPresentation(null);
    router.push({
      pathname: '/notification-target' as never,
      params: {
        route: normalizeNotificationRoute(envelope.route),
        eventId: envelope.eventId,
        title: envelope.content.title,
      },
    });
  }, [router]);

  const consumeResponse = useCallback(async (
    response: Notifications.NotificationResponse
  ) => {
    const responseId = response.notification.request.identifier;
    if (handledResponseIds.current.has(responseId)) return;

    const envelope = getEnvelopeFromNotification(response.notification);
    if (!envelope) return;
    handledResponseIds.current.add(responseId);

    if (response.actionIdentifier === 'mark_read') {
      await Promise.allSettled(envelope.eventIds.map(eventId =>
        getSupabase().rpc('mark_my_notification_event_read', {
          target_event_id: eventId,
        })
      ));
      await Notifications.dismissNotificationAsync(responseId).catch(() => undefined);
      return;
    }

    openEnvelope(envelope);
  }, [openEnvelope]);

  const register = useCallback(async (requestPermission: boolean) => {
    if (!session?.user) return;
    setBusy(true);
    setError(null);
    const registration = registerNativeNotificationInstallation({ requestPermission });
    registrationInFlightRef.current = registration;
    try {
      const result = await registration;
      if (sessionRef.current?.user.id === session.user.id) {
        setEnabled(result.enabled);
        setPermission(result.permission);
      }
    } catch (caught) {
      if (sessionRef.current?.user.id === session.user.id) {
        setEnabled(false);
        setError(caught instanceof Error ? caught.message : 'Notification setup failed.');
      }
      throw caught;
    } finally {
      if (registrationInFlightRef.current === registration) {
        registrationInFlightRef.current = null;
      }
      setBusy(false);
    }
  }, [session]);

  const enable = useCallback(async () => {
    await register(true);
  }, [register]);

  const disableThisDevice = useCallback(async () => {
    if (!session?.user) return;
    setBusy(true);
    try {
      await revokeNativeNotificationInstallation();
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = getSupabase();
    let active = true;
    void configureNativeNotifications()
      .then(() => Notifications.getPermissionsAsync())
      .then(nextPermissions => {
        if (!active) return;
        setPermission(nextPermissions.status);
        setEnabled(nextPermissions.status === 'granted');
      })
      .catch(caught => {
        if (active) setError(caught instanceof Error ? caught.message : 'Notification setup failed.');
      });

    const applySession = (nextSession: Session | null) => {
      const priorSession = sessionRef.current;
      sessionRef.current = nextSession;
      setSession(nextSession);

      if (priorSession?.user && !nextSession?.user) {
        setEnabled(false);
        setPresentation(null);
        const pendingRegistration = registrationInFlightRef.current;
        void (async () => {
          await pendingRegistration?.catch(() => undefined);
          await Promise.allSettled([
            revokeInstallationWithSession(priorSession),
            Notifications.unregisterForNotificationsAsync(),
            Notifications.dismissAllNotificationsAsync(),
            Notifications.setBadgeCountAsync(0),
          ]);
        })();
      }
    };

    void client.auth.getSession().then(({ data }) => {
      if (active) applySession(data.session);
    });
    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) applySession(nextSession);
    });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user || permission !== 'granted') return;
    void register(false).catch(() => undefined);
  }, [permission, register, session?.user]);

  useEffect(() => {
    if (!session?.user) return;
    const syncLease = (foreground: boolean) => {
      void updateNativeNotificationForegroundLease(foreground).catch(() => undefined);
    };
    syncLease(AppState.currentState === 'active');
    const appStateSubscription = AppState.addEventListener('change', state => {
      syncLease(state === 'active');
      if (state === 'active' && permission === 'granted') {
        void register(false).catch(() => undefined);
      }
    });
    const intervalId = setInterval(() => {
      if (AppState.currentState === 'active') syncLease(true);
    }, 30_000);
    return () => {
      clearInterval(intervalId);
      appStateSubscription.remove();
      syncLease(false);
    };
  }, [permission, register, session?.user]);

  useEffect(() => {
    const receiveSubscription = Notifications.addNotificationReceivedListener(notification => {
      const envelope = getEnvelopeFromNotification(notification);
      if (envelope && AppState.currentState === 'active') setPresentation(envelope);
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      void consumeResponse(response);
    });
    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      return consumeResponse(response).finally(() =>
        Notifications.clearLastNotificationResponseAsync()
      );
    });
    return () => {
      receiveSubscription.remove();
      responseSubscription.remove();
    };
  }, [consumeResponse]);

  const value = useMemo<NativeNotificationsContextValue>(() => ({
    enabled,
    permission,
    busy,
    error,
    enable,
    disableThisDevice,
  }), [busy, disableThisDevice, enable, enabled, error, permission]);

  return (
    <NativeNotificationsContext.Provider value={value}>
      {children}
      {presentation ? (
        <NativeNotificationBanner
          envelope={presentation}
          onDismiss={() => setPresentation(null)}
          onOpen={() => openEnvelope(presentation)}
        />
      ) : null}
    </NativeNotificationsContext.Provider>
  );
}

export const useNativeNotifications = () => {
  const value = useContext(NativeNotificationsContext);
  if (!value) {
    throw new Error('useNativeNotifications must be inside NativeNotificationsProvider.');
  }
  return value;
};

const styles = StyleSheet.create({
  bannerLayer: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
  },
  banner: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(233, 199, 102, 0.32)',
    borderRadius: 20,
    backgroundColor: 'rgba(13, 14, 15, 0.98)',
    padding: 12,
    boxShadow: '0 14px 36px rgba(0, 0, 0, 0.52)',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(233, 199, 102, 0.44)',
  },
  avatarFallback: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(233, 199, 102, 0.44)',
    backgroundColor: '#181816',
  },
  avatarInitial: {
    color: '#E9C766',
    fontSize: 17,
    fontWeight: '800',
  },
  bannerContent: {
    minHeight: 48,
    flex: 1,
    justifyContent: 'center',
  },
  eyebrow: {
    color: '#E9C766',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  bannerTitle: {
    marginTop: 2,
    color: '#F7F0DE',
    fontSize: 14,
    fontWeight: '800',
  },
  bannerBody: {
    marginTop: 2,
    color: '#A69B82',
    fontSize: 12,
    lineHeight: 17,
  },
  media: {
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  dismiss: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  dismissText: {
    color: '#A69B82',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
  },
  pressed: {
    opacity: 0.7,
  },
});
