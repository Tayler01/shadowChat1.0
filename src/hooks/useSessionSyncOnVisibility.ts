import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useSessionSyncOnVisibility() {
  const { setUser } = useAuth();

  useEffect(() => {
    const handleVisibility = async () => {
      if (!document.hidden) {
        console.log('👁️ Tab visible — forcing session sync');

        try {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.warn('⚠️ Session refresh error:', refreshError.message);
            return;
          }

          const { data } = await supabase.auth.getSession();
          const freshUser = data?.session?.user;
          console.log('✅ Refreshed session:', freshUser?.id || 'no user');

          // If we have a fresh user, get their profile
          if (freshUser) {
            try {
              const { getCurrentUser } = await import('../lib/auth');
              const profile = await getCurrentUser();
              setUser(profile);
            } catch (error) {
              console.error('❌ Error getting user profile after session refresh:', error);
              setUser(null);
            }
          } else {
            setUser(null);
          }
        } catch (e) {
          console.error('❌ Session rehydration exception:', e);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [setUser]);
}