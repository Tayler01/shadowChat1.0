import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { CommunityContext } from '../community/communityRuntime';
import {
  announceHelperReset,
  isCurrentCommunity,
  requireCommunity,
} from '../community/communityBindings';
export { nativeRealtimeOptions, nativeRealtimeTopic } from './privateRealtimeChannels';
export const isSupabaseConfigured = Boolean(
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);
void SecureStore.deleteItemAsync('shadowchat-mobile-auth').catch(() => undefined);
type Client = SupabaseClient;
type Record = {
  client: Client;
  hasSession: boolean;
  abort: Set<AbortController>;
  unsubscribe: () => void;
  dispose: () => void;
};
const clients = new WeakMap<CommunityContext, Record>();
const channelOwners = new WeakMap<RealtimeChannel, Client>();
export const getSupabase = (context: CommunityContext = requireCommunity()) => {
  if (!isCurrentCommunity(context)) throw new Error('This community is no longer active.');
  const record = clients.get(context);
  if (record) return record.client;
  const abort = new Set<AbortController>();
  let disposed = false;
  const client = createClient(context.community.supabaseUrl, context.community.publicKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    realtime: { params: { eventsPerSecond: 50 } },
    global: {
      fetch: async (input, options) => {
        if (disposed || !isCurrentCommunity(context))
          throw new Error('This community is no longer active.');
        const target = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        );
        if (target.origin !== context.community.supabaseUrl)
          throw new Error('Unexpected native backend.');
        const controller = new AbortController();
        abort.add(controller);
        const cancel = () => controller.abort();
        const release = () => {
          abort.delete(controller);
          options?.signal?.removeEventListener('abort', cancel);
        };
        // Keep cancellation/deadline live through the SDK's later JSON/body read.
        const timeout = setTimeout(() => {
          controller.abort();
          release();
        }, 15_000);
        options?.signal?.addEventListener('abort', cancel, { once: true });
        if (options?.signal?.aborted) controller.abort();
        try {
          return await fetch(input, { ...options, signal: controller.signal });
        } catch (error) {
          clearTimeout(timeout);
          release();
          throw error;
        }
      },
    },
  });
  const createChannel = client.channel.bind(client);
  client.channel = (...args) => {
    if (disposed || !isCurrentCommunity(context))
      throw new Error('This community is no longer active.');
    const channel = createChannel(...args);
    channelOwners.set(channel, client);
    return channel;
  };
  const owned: Record = {
    client,
    hasSession: false,
    abort,
    unsubscribe: () => undefined,
    dispose: () => {
      disposed = true;
    },
  };
  owned.unsubscribe = client.auth.onAuthStateChange((_event, session) => {
    owned.hasSession = Boolean(session);
  }).data.subscription.unsubscribe;
  clients.set(context, owned);
  return client;
};
export const abortCommunityRequests = (context: CommunityContext) => {
  for (const controller of clients.get(context)?.abort ?? []) controller.abort();
};
export const disposeCommunityClient = async (context: CommunityContext) => {
  const record = clients.get(context);
  if (!record) return;
  clients.delete(context);
  record.dispose();
  for (const controller of record.abort) controller.abort();
  record.unsubscribe();
  await record.client.auth.stopAutoRefresh();
  await record.client.removeAllChannels();
};
export const resetCommunityMemory = async (
  context: CommunityContext,
  invalidatePending = false
) => {
  const record = clients.get(context);
  if (!record || (!record.hasSession && !invalidatePending)) return;
  await disposeCommunityClient(context);
  if (isCurrentCommunity(context)) announceHelperReset();
};
export const removeRealtimeChannel = (channel: RealtimeChannel | null) => {
  if (!channel) return;
  const owner = channelOwners.get(channel);
  channelOwners.delete(channel);
  if (owner) void owner.removeChannel(channel).catch(() => undefined);
};
