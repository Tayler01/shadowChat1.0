import 'react-native-url-polyfill/auto';

import * as SecureStore from 'expo-secure-store';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const memorySessionStore = new Map<string, string>();

const secureSessionStorage = {
  getItem: async (key: string) => {
    try {
      const value = await SecureStore.getItemAsync(key);
      return value ?? memorySessionStore.get(key) ?? null;
    } catch {
      return memorySessionStore.get(key) ?? null;
    }
  },
  setItem: async (key: string, value: string) => {
    memorySessionStore.set(key, value);
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Keep the in-memory session for this run if secure persistence is unavailable.
    }
  },
  removeItem: async (key: string) => {
    memorySessionStore.delete(key);
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Nothing else to clean up.
    }
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: secureSessionStorage,
        storageKey: 'shadowchat-mobile-auth',
      },
      realtime: {
        params: {
          eventsPerSecond: 50,
        },
      },
    })
  : null;

export const getSupabase = () => {
  if (!supabase) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env.'
    );
  }

  return supabase;
};

export const removeRealtimeChannel = (channel: RealtimeChannel | null) => {
  if (!channel || !supabase) return;

  try {
    supabase.removeChannel(channel);
  } catch {
    // Realtime cleanup should never crash the UI.
  }
};
