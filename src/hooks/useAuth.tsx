/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  supabase,
  User,
  updateUserPresence,
  getWorkingClient,
  ensureSession,
  getSessionWithTimeout,
  getStoredRefreshToken,
  recoverSessionAfterResume,
} from '../lib/supabase';
import { PRESENCE_INTERVAL_MS } from '../config';
import {
  signIn as authSignIn,
  signUp as authSignUp,
  signOut as authSignOut,
  getCurrentUser,
  updateUserProfile,
  uploadUserAvatar,
  uploadUserBanner,
} from '../lib/auth';
import { markPhoneInstallOnboardingPending } from '../lib/phoneInstallOnboarding';

interface AuthContextValue {
  user: User | null;
  profile: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    userData: { full_name: string; username: string }
  ) => Promise<any>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<User | void>;
  uploadAvatar: (file: File) => Promise<string | void>;
  uploadBanner: (file: File) => Promise<string | void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_RESTORE_RETRY_DELAYS_MS = [0, 450, 1200, 2400];
const STORED_SESSION_RETRY_MS = 10000;

const wait = (ms: number) =>
  new Promise(resolve => window.setTimeout(resolve, ms));

function useProvideAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(false);
  const mountedRef = useRef(true);
  const authChangeTaskRef = useRef(0);
  const restoreRetryTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const clearRestoreRetry = () => {
      if (restoreRetryTimeoutRef.current !== null) {
        window.clearTimeout(restoreRetryTimeoutRef.current);
        restoreRetryTimeoutRef.current = null;
      }
    };

    const applyRealtimeAuth = (accessToken?: string | null) => {
      try {
        supabase.realtime.setAuth(accessToken || '');
      } catch {
        // ignore realtime auth propagation failures
      }
    };

    const handleDeferredAuthChange = async (event: string, session: any) => {
      if (!mountedRef.current) {
        return;
      }

      const taskId = ++authChangeTaskRef.current;
      applyRealtimeAuth(session?.access_token);

      if (event === 'SIGNED_OUT') {
        if (mountedRef.current) {
          setUser(null);
        }
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        return;
      }

      if (!session?.user) {
        if (mountedRef.current) {
          setUser(null);
        }
        return;
      }

      try {
        const profile = await getCurrentUser();
        if (!mountedRef.current || authChangeTaskRef.current !== taskId) {
          return;
        }

        if (profile) {
          setUser(profile);
          setError(null);
        } else {
          setUser(null);
        }
      } catch {
        if (mountedRef.current && authChangeTaskRef.current === taskId) {
          setError('Failed to load user profile. Please try signing in again.');
          setUser(null);
        }
      }
    };

    const restoreSessionForLaunch = async () => {
      const hasStoredRefreshToken = Boolean(getStoredRefreshToken());
      const delays = hasStoredRefreshToken ? AUTH_RESTORE_RETRY_DELAYS_MS : [0];

      for (let attempt = 0; attempt < delays.length; attempt += 1) {
        if (!mountedRef.current) {
          return false;
        }

        const delay = delays[attempt];
        if (delay > 0) {
          await wait(delay);
        }

        const sessionReady = await ensureSession(attempt > 0);
        if (sessionReady) {
          return true;
        }

        if (hasStoredRefreshToken) {
          const recovered = await recoverSessionAfterResume();
          if (recovered) {
            return true;
          }
        }
      }

      return false;
    };
    
    // Get initial session
    const getInitialSession = async () => {
      if (initialLoadRef.current) return;
      clearRestoreRetry();
      let keepRestoringStoredSession = false;

      const continueStoredSessionRecovery = (message: string) => {
        keepRestoringStoredSession = true;

        if (!mountedRef.current) {
          return;
        }

        setError(message);
        setLoading(true);

        restoreRetryTimeoutRef.current = window.setTimeout(() => {
          restoreRetryTimeoutRef.current = null;
          if (!mountedRef.current) {
            return;
          }

          initialLoadRef.current = false;
          void getInitialSession();
        }, STORED_SESSION_RETRY_MS);
      };
      
      
      try {
        const sessionReady = await restoreSessionForLaunch();
        if (!sessionReady) {
          if (getStoredRefreshToken()) {
            continueStoredSessionRecovery('Still reconnecting your saved session. Keep the app open and we will keep trying.');
            return;
          }

          if (mountedRef.current) {
            setUser(null);
          }
          return;
        }

        const workingClient = await getWorkingClient();
        const { data: { session }, error: sessionError } = await getSessionWithTimeout(workingClient);
        // Ensure realtime uses the latest access token
        applyRealtimeAuth(session?.access_token);
        
        // Handle the specific "user not found" error from invalid JWT
        if (sessionError && sessionError.message?.includes('User from sub claim in JWT does not exist')) {
          await workingClient.auth.signOut();
          if (mountedRef.current) setUser(null);
          return;
        }
        
        if (sessionError) {
          if (getStoredRefreshToken()) {
            continueStoredSessionRecovery('Still reconnecting your saved session. Keep the app open and we will keep trying.');
            return;
          }

          if (mountedRef.current) {
            setError(sessionError.message);
            setUser(null);
          }
          return;
        }
        
        
        if (session?.user) {
          try {
            const profile = await getCurrentUser();
            if (!profile && getStoredRefreshToken()) {
              continueStoredSessionRecovery('Still reconnecting your saved profile. Keep the app open and we will keep trying.');
              return;
            }

            if (mountedRef.current) {
              setUser(profile);
            }
          } catch {
            if (getStoredRefreshToken()) {
              continueStoredSessionRecovery('Still reconnecting your saved profile. Keep the app open and we will keep trying.');
              return;
            }

            if (mountedRef.current) {
              setError('Failed to load user profile. Please try refreshing the page.');
              setUser(null);
            }
          }
        } else {
          if (mountedRef.current) {
            setUser(null);
          }
        }
      } catch (err) {
        
        // Check if this is the specific "user not found" error from invalid JWT
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        if (errorMessage.includes('User from sub claim in JWT does not exist')) {
          // Clear the invalid session
          await authSignOut();
          if (mountedRef.current) setUser(null);
          // Don't set this as an error since it's expected behavior
        } else {
          if (getStoredRefreshToken()) {
            continueStoredSessionRecovery('Still reconnecting your saved session. Keep the app open and we will keep trying.');
            return;
          }

          if (mountedRef.current) {
            setError(errorMessage);
            setUser(null);
          }
        }
      } finally {
        if (mountedRef.current) {
          setLoading(keepRestoringStoredSession);
        }
        if (!keepRestoringStoredSession) {
          clearRestoreRetry();
          initialLoadRef.current = true;
        }
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string, session: any) => {
        // Skip if we're still doing initial load or component is unmounted
        if (!initialLoadRef.current || !mountedRef.current) {
          return;
        }

        // Supabase warns against awaiting more Supabase calls inside this
        // callback because it can deadlock auth operations. Defer the work
        // until after the callback returns.
        window.setTimeout(() => {
          void handleDeferredAuthChange(event, session);
        }, 0);
      }
    );

    return () => {
      mountedRef.current = false;
      clearRestoreRetry();
      subscription.unsubscribe();
    };
  }, []);

  // Update presence periodically
  useEffect(() => {
    if (!user) return;

    const updatePresence = () => updateUserPresence();
    
    // Update immediately
    updatePresence();
    
    // Update at configured interval
    const interval = setInterval(updatePresence, PRESENCE_INTERVAL_MS);
    
    // Update on page visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        updatePresence();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await authSignIn({ email, password });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    userData: { full_name: string; username: string }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authSignUp({
        email,
        password,
        username: userData.username,
        displayName: userData.full_name,
      });

      markPhoneInstallOnboardingPending(email, result.user?.id || result.profile?.id);
      
      // If user is auto-confirmed (has session), set user immediately
      if (result.session && result.profile) {
        setUser(result.profile);
      } else if (result.user && !result.session) {
        // Don't set user yet, they need to confirm email
      }
      
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    setError(null);
    try {
      await authSignOut();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      setError(message);
      throw err;
    } finally {
      // Clear cached chat history and failed message queues on sign out
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem('chatHistory');
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('failed-')) {
              localStorage.removeItem(key);
            }
          });
        } catch {
          // ignore storage errors
        }
      }

      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;

    try {
      const updatedUser = await updateUserProfile(updates);
      setUser(updatedUser);
      return updatedUser;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Profile update failed';
      setError(message);
      throw err;
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    try {
      const url = await uploadUserAvatar(file);
      setUser(prev => (prev ? { ...prev, avatar_url: url } : prev));
      return url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Avatar upload failed';
      setError(message);
      throw err;
    }
  };

  const uploadBanner = async (file: File) => {
    if (!user) return;
    try {
      const url = await uploadUserBanner(file);
      setUser(prev => (prev ? { ...prev, banner_url: url } : prev));
      return url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Banner upload failed';
      setError(message);
      throw err;
    }
  };

  return {
    user,
    profile: user, // Add profile alias for backward compatibility
    loading,
    error,
    signIn,
    signUp,
    signOut,
    updateProfile,
    uploadAvatar,
    uploadBanner,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideAuth();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

