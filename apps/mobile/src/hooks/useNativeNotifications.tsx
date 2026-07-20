import type { Session } from '@supabase/supabase-js';
import notifee, { EventType, type Event as NotifeeEvent } from '@notifee/react-native';
import * as Notifications from 'expo-notifications';
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
  getNativeNotificationDeviceOptOut,
  getNativeNotificationInstallationKey,
  registerNativeNotificationInstallation,
  refreshNativeNotificationToken,
  revokeNativeNotificationInstallation,
  setNativeNotificationDeviceOptOut,
  updateNativeNotificationForegroundLease,
} from '@/lib/notifications/registration';
import {
  parseNotifeeEnvelope,
  reconcileAndroidNotificationGroups,
} from '@/lib/notifications/androidPresenter';
import { publishNativeNotificationRoute } from '@/lib/nativeAppBridge';
import { normalizeNotificationRoute } from '@/lib/notifications/routes';
import {
  parseNotificationEnvelopeV2,
  type NotificationEnvelopeV2,
} from '@/types/notification-envelope-v2';
import { runNotificationStage } from '@/lib/notifications/registrationPipeline';
import type { NativeNotificationStage } from '@/lib/nativeAppBridge';

type NativeNotificationsContextValue = {
  enabled: boolean;
  permission: Notifications.PermissionStatus | 'unknown';
  busy: boolean;
  error: string | null;
  requestId: string | null;
  stage: NativeNotificationStage;
  enable: (requestId?: string | null) => Promise<void>;
  disableThisDevice: (requestId?: string | null) => Promise<void>;
};

const NativeNotificationsContext =
  createContext<NativeNotificationsContextValue | null>(null);

const createNativeNotificationRequestId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
  const [session, setSession] = useState<Session | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] =
    useState<Notifications.PermissionStatus | 'unknown'>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [stage, setStage] = useState<NativeNotificationStage>('idle');
  const [presentation, setPresentation] = useState<NotificationEnvelopeV2 | null>(null);
  const handledResponseIds = useRef(new Set<string>());
  const handledNotifeeActionIds = useRef(new Set<string>());
  const pendingResponseRef =
    useRef<Notifications.NotificationResponse | null>(null);
  const pendingNotifeeEventRef =
    useRef<Pick<NotifeeEvent, 'type' | 'detail'> | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const registrationInFlightRef = useRef<{
    requestId: string;
    promise: Promise<void>;
  } | null>(null);

  const syncBadgeCount = useCallback(async () => {
    const { data, error: badgeError } = await getSupabase().rpc(
      'get_app_badge_state_v2'
    );
    if (badgeError) throw badgeError;
    const record = (
      data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : {}
    );
    const total = Number(record.total ?? 0);
    const bounded = Number.isFinite(total)
      ? Math.max(0, Math.min(99, Math.floor(total)))
      : 0;
    await Promise.all([
      Notifications.setBadgeCountAsync(bounded),
      notifee.setBadgeCount(bounded),
    ]);
  }, []);

  const dismissEnvelopeNotifications = useCallback(async (eventIds: string[]) => {
    const targetIds = new Set(eventIds);
    const presented = await Notifications.getPresentedNotificationsAsync()
      .catch(() => []);
    await Promise.allSettled(
      presented
        .filter(notification => {
          const envelope = getEnvelopeFromNotification(notification);
          return envelope?.eventIds.some(eventId => targetIds.has(eventId));
        })
        .map(notification =>
          Notifications.dismissNotificationAsync(notification.request.identifier)
        )
    );
    const displayed = await notifee.getDisplayedNotifications().catch(() => []);
    const affectedGroupKeys = new Set<string>();
    await Promise.allSettled(
      displayed
        .filter(item => {
          const envelope = parseNotifeeEnvelope(item.notification);
          const matches =
            envelope?.eventIds.some(eventId => targetIds.has(eventId)) ?? false;
          if (matches && envelope?.groupKey) {
            affectedGroupKeys.add(envelope.groupKey);
          }
          return matches;
        })
        .map(item => item.notification.id
          ? notifee.cancelNotification(item.notification.id)
          : Promise.resolve())
    );
    await reconcileAndroidNotificationGroups(affectedGroupKeys)
      .catch(() => undefined);
  }, []);

  const markEnvelopeRead = useCallback(async (
    envelope: NotificationEnvelopeV2
  ) => {
    for (const eventId of envelope.eventIds) {
      const { error: readError } = await getSupabase().rpc(
        'mark_my_notification_event_read',
        { target_event_id: eventId }
      );
      if (readError) throw readError;
    }
    await Promise.all([
      dismissEnvelopeNotifications(envelope.eventIds),
      syncBadgeCount(),
    ]);
  }, [dismissEnvelopeNotifications, syncBadgeCount]);

  const openEnvelope = useCallback(async (envelope: NotificationEnvelopeV2) => {
    setPresentation(null);
    publishNativeNotificationRoute(normalizeNotificationRoute(envelope.route));
    void markEnvelopeRead(envelope).catch(caught => {
      setError(caught instanceof Error ? caught.message : 'Could not mark notification as read.');
    });
  }, [markEnvelopeRead]);

  const consumeResponse = useCallback(async (
    response: Notifications.NotificationResponse
  ) => {
    if (!sessionRef.current?.user) {
      pendingResponseRef.current = response;
      return;
    }
    const responseId = response.notification.request.identifier;
    if (handledResponseIds.current.has(responseId)) return;

    const envelope = getEnvelopeFromNotification(response.notification);
    if (!envelope) return;
    handledResponseIds.current.add(responseId);

    if (response.actionIdentifier === 'mark_read') {
      await markEnvelopeRead(envelope);
      return;
    }

    await openEnvelope(envelope);
  }, [markEnvelopeRead, openEnvelope]);

  const consumeNotifeeEvent = useCallback(async (
    event: Pick<NotifeeEvent, 'type' | 'detail'>
  ) => {
    if (
      event.type !== EventType.PRESS &&
      event.type !== EventType.ACTION_PRESS
    ) return;
    if (!sessionRef.current?.user) {
      pendingNotifeeEventRef.current = event;
      return;
    }
    const envelope = parseNotifeeEnvelope(event.detail.notification);
    if (!envelope) return;
    const actionKey = [
      event.detail.notification?.id ?? envelope.eventId,
      event.detail.pressAction?.id ?? 'open',
    ].join(':');
    if (handledNotifeeActionIds.current.has(actionKey)) return;
    handledNotifeeActionIds.current.add(actionKey);
    if (event.detail.pressAction?.id === 'mark_read') {
      await markEnvelopeRead(envelope);
      return;
    }
    await openEnvelope(envelope);
  }, [markEnvelopeRead, openEnvelope]);

  const register = useCallback((
    requestPermission: boolean,
    providedRequestId?: string | null
  ) => {
    const activeRequestId =
      providedRequestId ??
      createNativeNotificationRequestId(requestPermission ? 'enable' : 'refresh');
    const pending = registrationInFlightRef.current;
    if (pending?.requestId === activeRequestId) return pending.promise;

    const registration = Promise.resolve().then(async () => {
      const isCurrent = () =>
        registrationInFlightRef.current?.requestId === activeRequestId;
      setRequestId(activeRequestId);
      setBusy(true);
      setStage('syncing_session');
      setError(null);

      try {
        if (requestPermission) {
          await runNotificationStage({
            stage: 'reading_permission',
            operation: () => setNativeNotificationDeviceOptOut(false),
          });
        }

        let activeSession = sessionRef.current;
        if (!activeSession?.user) {
          const { data, error: sessionError } = await runNotificationStage({
            stage: 'syncing_session',
            operation: () => getSupabase().auth.getSession(),
          });
          if (sessionError) throw sessionError;
          activeSession = data.session;
          if (activeSession?.user) {
            sessionRef.current = activeSession;
            setSession(activeSession);
          }
        }
        if (!activeSession?.user) {
          throw new Error('Sign in to ShadoChat before enabling notifications.');
        }

        const expectedUserId = activeSession.user.id;
        const result = await registerNativeNotificationInstallation({
          requestPermission,
          onStage: nextStage => {
            if (isCurrent()) setStage(nextStage);
          },
          onPermission: nextPermission => {
            if (isCurrent()) setPermission(nextPermission);
          },
        });
        if (
          isCurrent() &&
          sessionRef.current?.user.id === expectedUserId
        ) {
          setEnabled(result.enabled);
          setPermission(result.permission);
          setStage(result.enabled ? 'ready' : 'idle');
        }
      } catch (caught) {
        if (isCurrent()) {
          setEnabled(false);
          setStage('failed');
          setError(
            caught instanceof Error
              ? caught.message
              : 'Notification setup failed.'
          );
        }
        throw caught;
      } finally {
        if (isCurrent()) {
          registrationInFlightRef.current = null;
          setBusy(false);
        }
      }
    });

    registrationInFlightRef.current = {
      requestId: activeRequestId,
      promise: registration,
    };
    return registration;
  }, []);

  const enable = useCallback(
    (nextRequestId?: string | null) => register(true, nextRequestId),
    [register]
  );

  const disableThisDevice = useCallback(async (nextRequestId?: string | null) => {
    if (!session?.user) return;
    setRequestId(
      nextRequestId ?? createNativeNotificationRequestId('disable')
    );
    setBusy(true);
    setStage('idle');
    try {
      await setNativeNotificationDeviceOptOut(true);
      await revokeNativeNotificationInstallation();
      await Promise.all([
        Notifications.dismissAllNotificationsAsync(),
        Notifications.setBadgeCountAsync(0),
        notifee.cancelAllNotifications(),
        notifee.setBadgeCount(0),
      ]);
      setEnabled(false);
      setStage('idle');
    } finally {
      setBusy(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = getSupabase();
    let active = true;
    let authEventVersion = 0;
    void configureNativeNotifications()
      .then(() => Notifications.getPermissionsAsync())
      .then(async nextPermissions => {
        if (!active) return;
        const optedOut = await getNativeNotificationDeviceOptOut();
        setPermission(nextPermissions.status);
        setEnabled(nextPermissions.status === 'granted' && !optedOut);
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
        const pendingRegistration = registrationInFlightRef.current?.promise;
        void (async () => {
          await pendingRegistration?.catch(() => undefined);
          await Promise.allSettled([
            revokeInstallationWithSession(priorSession),
            Notifications.unregisterForNotificationsAsync(),
            Notifications.dismissAllNotificationsAsync(),
            Notifications.setBadgeCountAsync(0),
            notifee.cancelAllNotifications(),
            notifee.setBadgeCount(0),
          ]);
        })();
      }
    };

    void client.auth.getSession().then(({ data }) => {
      if (active && authEventVersion === 0) applySession(data.session);
    });
    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => {
      authEventVersion += 1;
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
    if (!session?.user || permission !== 'granted') return;
    const subscription = Notifications.addPushTokenListener(devicePushToken => {
      void refreshNativeNotificationToken(devicePushToken).catch(caught => {
        setError(caught instanceof Error
          ? caught.message
          : 'Notification token refresh failed.');
      });
    });
    return () => subscription.remove();
  }, [permission, session?.user]);

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
        void syncBadgeCount().catch(() => undefined);
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
  }, [
    permission,
    register,
    session?.user,
    syncBadgeCount,
  ]);

  useEffect(() => {
    const receiveSubscription = Notifications.addNotificationReceivedListener(notification => {
      const envelope = getEnvelopeFromNotification(notification);
      if (envelope && AppState.currentState === 'active') setPresentation(envelope);
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      void consumeResponse(response);
    });
    const notifeeSubscription = notifee.onForegroundEvent(event => {
      void consumeNotifeeEvent(event);
    });
    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      return consumeResponse(response).finally(() =>
        Notifications.clearLastNotificationResponseAsync()
      );
    });
    void notifee.getInitialNotification().then(initial => {
      if (!initial) return;
      return consumeNotifeeEvent({
        type: EventType.PRESS,
        detail: {
          notification: initial.notification,
          pressAction: initial.pressAction,
        },
      });
    });
    return () => {
      receiveSubscription.remove();
      responseSubscription.remove();
      notifeeSubscription();
    };
  }, [
    consumeNotifeeEvent,
    consumeResponse,
  ]);

  useEffect(() => {
    if (!session?.user) return;
    const pendingResponse = pendingResponseRef.current;
    const pendingNotifeeEvent = pendingNotifeeEventRef.current;
    pendingResponseRef.current = null;
    pendingNotifeeEventRef.current = null;
    if (pendingResponse) {
      void consumeResponse(pendingResponse).catch(caught => {
        setError(caught instanceof Error
          ? caught.message
          : 'Could not open notification.');
      });
    }
    if (pendingNotifeeEvent) {
      void consumeNotifeeEvent(pendingNotifeeEvent).catch(caught => {
        setError(caught instanceof Error
          ? caught.message
          : 'Could not open notification.');
      });
    }
  }, [consumeNotifeeEvent, consumeResponse, session?.user]);

  useEffect(() => {
    if (!session?.user) return;
    const client = getSupabase();
    const channel = client
      .channel(`native-notifications:${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_events',
          filter: `user_id=eq.${session.user.id}`,
        },
        payload => {
          void syncBadgeCount().catch(() => undefined);
          if (payload.eventType !== 'UPDATE') return;
          const updated = payload.new as {
            id?: string;
            read_at?: string | null;
            resolved_at?: string | null;
          };
          if (updated.id && (updated.read_at || updated.resolved_at)) {
            void dismissEnvelopeNotifications([updated.id]);
          }
        }
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [dismissEnvelopeNotifications, session?.user, syncBadgeCount]);

  useEffect(() => {
    if (!presentation) return;
    const eventId = presentation.eventId;
    const timeoutId = setTimeout(() => {
      setPresentation(current => current?.eventId === eventId ? null : current);
    }, 6_000);
    return () => clearTimeout(timeoutId);
  }, [presentation]);

  const value = useMemo<NativeNotificationsContextValue>(() => ({
    enabled,
    permission,
    busy,
    error,
    requestId,
    stage,
    enable,
    disableThisDevice,
  }), [
    busy,
    disableThisDevice,
    enable,
    enabled,
    error,
    permission,
    requestId,
    stage,
  ]);

  return (
    <NativeNotificationsContext.Provider value={value}>
      {children}
      {presentation ? (
        <NativeNotificationBanner
          envelope={presentation}
          onDismiss={() => setPresentation(null)}
          onOpen={() => void openEnvelope(presentation)}
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
