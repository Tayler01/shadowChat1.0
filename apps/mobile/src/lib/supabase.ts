import 'react-native-url-polyfill/auto';

import * as SecureStore from 'expo-secure-store';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// The hosted WebView is the only owner of the Supabase refresh-token chain.
// Older native builds persisted the same session independently, allowing both
// clients to rotate one refresh token when iOS resumed the app. Remove that
// legacy copy and keep the native helper session memory-only.
const LEGACY_NATIVE_AUTH_STORAGE_KEY = 'shadowchat-mobile-auth';
void SecureStore.deleteItemAsync(LEGACY_NATIVE_AUTH_STORAGE_KEY)
  .catch(() => undefined);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
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
