import notifee from '@notifee/react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommunityChoice } from './CommunityChoice';
import { NativeLaunchLoader } from '../components/NativeLaunchLoader';
import type { CommunityContext, CommunityId } from './communityRuntime';

import {
  activeCommunity,
  announceCommunityChange,
  baseAppRuntime,
  communityController,
  communityRegistry,
  communityRevision,
  communityHelperRevision,
  drainCommunity,
  initializeCommunity,
  isCurrentCommunity,
  subscribeCommunity,
} from './communityBindings';
import { createScopedRegistration } from '../lib/notifications/registration';
import { abortCommunityRequests, disposeCommunityClient } from '../lib/supabase';

const SELECTION = 'shadowchat-community-selection-v1';
type Binding = { context: CommunityContext; requestChooser: () => void };
const BindingContext = createContext<Binding | null>(null);
export const useCommunityBinding = () => {
  const value = useContext(BindingContext);
  if (!value) throw new Error('A selected community is required.');
  return value;
};

export function NativeCommunityBoundary({ children }: { children: ReactNode }) {
  useSyncExternalStore(subscribeCommunity, communityRevision, communityRevision);
  const [context, setContext] = useState<CommunityContext | null>(activeCommunity);
  const [ready, setReady] = useState(false),
    [choosing, setChoosing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | undefined>();
  const [clientEpoch, setClientEpoch] = useState(0);
  const selecting = useRef(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const choose = useCallback(
    async (id: CommunityId) => {
      if (!communityController || !communityRegistry || selecting.current) return;
      selecting.current = true;
      setBusy(true);
      setError(undefined);
      try {
        let next: CommunityContext;
        if (!context) {
          await SecureStore.setItemAsync(SELECTION, id);
          next = communityController.select(id);
        } else
          next = await communityController.switchCommunity(id, {
            abortAndDrainCommands: async (old) => {
              abortCommunityRequests(old);
              await drainCommunity(old);
            },
            revokeInstallation: async (old) => {
              await createScopedRegistration(old).revokeNativeNotificationInstallation();
            },
            clearPresentedNotifications: async () => {
              await Promise.all([
                Notifications.dismissAllNotificationsAsync(),
                Notifications.cancelAllScheduledNotificationsAsync(),
                Notifications.setBadgeCountAsync(0),
                notifee.cancelAllNotifications(),
                notifee.setBadgeCount(0),
              ]);
            },
            clearClientSession: disposeCommunityClient,
            unmountAndDispose: async () => {
              setContext(null);
            },
            persistSelection: (id) => SecureStore.setItemAsync(SELECTION, id),
          });
        setContext(next);
        setChoosing(false);
        setClientEpoch((value) => value + 1);
        announceCommunityChange();
      } catch {
        setContext(context);
        setError('The community switch could not finish. Retry before continuing.');
        setChoosing(true);
      } finally {
        selecting.current = false;
        setBusy(false);
      }
    },
    [context]
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!communityRegistry || !communityController) {
        setError('This build is missing its public community configuration.');
        setReady(true);
        return;
      }
      const next = await initializeCommunity({
        registry: communityRegistry,
        controller: communityController,
        streamlined: baseAppRuntime.streamlined,
        readSelection: () => SecureStore.getItemAsync(SELECTION),
        persistSelection: (id) => SecureStore.setItemAsync(SELECTION, id),
        revokeLegacy: async () => {
          const legacy = await SecureStore.getItemAsync(
            'shadowchat-native-notification-installation-credential-v2'
          );
          if (!legacy) return;
          const registration = createScopedRegistration(
            { community: communityRegistry!.member, generation: 0 },
            true
          );
          await registration.getNativeNotificationInstallationCredential();
          await registration.revokeNativeNotificationInstallation();
        },
      });
      if (cancelled) return;
      setContext(next);
      setChoosing(!next);
      setReady(true);
    })().catch(() => {
      if (!cancelled) {
        setError('Previous notification registration must be resolved before continuing.');
        setReady(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [startupAttempt]);
  const requestChooser = () => {
    if (communityController?.status().signedIn) {
      setError('Sign out before changing community.');
      return;
    }
    setChoosing(true);
  };
  const blocked = communityController?.status().phase === 'blocked';
  return (
    <View style={styles.fill}>
      {context && isCurrentCommunity(context) ? (
        <BindingContext.Provider value={{ context, requestChooser }}>
          <View
            key={`${context.generation}:${clientEpoch}:${communityHelperRevision()}`}
            style={styles.fill}
          >
            {children}
          </View>
        </BindingContext.Provider>
      ) : null}
      {!ready || choosing || !context || blocked || busy ? (
        <SafeAreaView style={[styles.cover, styles.fill]}>
          {ready && communityRegistry ? (
            <CommunityChoice
              registry={communityRegistry}
              busy={busy}
              error={error}
              onSelect={(id) => {
                void choose(id);
              }}
            />
          ) : (
            <View style={[styles.center, baseAppRuntime.streamlined && styles.streamlinedLoading]}>
              {baseAppRuntime.streamlined ? (
                <NativeLaunchLoader stage="Preparing your community�" />
              ) : (
                <ActivityIndicator color="#E9C766" />
              )}
              {error || !baseAppRuntime.streamlined ? (
                <Text style={styles.text}>{error ?? 'Opening ShadoChat'}</Text>
              ) : null}
              {error ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setError(undefined);
                    setReady(false);
                    setStartupAttempt((value) => value + 1);
                  }}
                >
                  <Text style={styles.text}>Retry opening community</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </SafeAreaView>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#050505' },
  cover: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  streamlinedLoading: { backgroundColor: '#0d0f10' },
  text: { color: '#F4E9CF', fontSize: 16, lineHeight: 24 },
});
