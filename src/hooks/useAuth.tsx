import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase, User, updateUserPresence, getWorkingClient } from '../lib/supabase';
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

function useProvideAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    
    // Get initial session
    const getInitialSession = async () => {
      if (initialLoadRef.current) return;
      
      
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        // Ensure realtime uses the latest access token
        supabase.realtime.setAuth(session?.access_token || '');
        
        // Handle the specific "user not found" error from invalid JWT
        if (sessionError && sessionError.message?.includes('User from sub claim in JWT does not exist')) {
          await supabase.auth.signOut();
          if (mountedRef.current) setUser(null);
          return;
        }
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          if (mountedRef.current) {
            setError(sessionError.message);
            setUser(null);
          }
          return;
        }
        
        
        if (session?.user) {
          try {
            const profile = await getCurrentUser();
            if (mountedRef.current) {
              setUser(profile);
            }
          } catch (error) {
            console.error('Failed to get user profile during initial session:', error);
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
      } catch (error) {
        console.error('Error getting initial session:', error);
        
        // Check if this is the specific "user not found" error from invalid JWT
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('User from sub claim in JWT does not exist')) {
          // Clear the invalid session
          await authSignOut();
          if (mountedRef.current) setUser(null);
          // Don't set this as an error since it's expected behavior
        } else {
          if (mountedRef.current) {
            setError(errorMessage);
            setUser(null);
          }
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
        initialLoadRef.current = true;
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Skip if we're still doing initial load or component is unmounted
        if (!initialLoadRef.current || !mountedRef.current) {
          return;
        }

        // Update realtime auth token whenever session changes
        supabase.realtime.setAuth(session?.access_token || '');

        
          if (event === 'SIGNED_OUT') {
            if (mountedRef.current) setUser(null);
          } else if (session?.user) {
            try {
              const profile = await getCurrentUser();
              if (profile) {
                if (mountedRef.current) setUser(profile);
              } else {
                if (mountedRef.current) setUser(null);
              }
          } catch (error) {
            console.error('Failed to get user profile during auth change:', error);
            if (mountedRef.current) {
              setError('Failed to load user profile. Please try signing in again.');
              setUser(null);
            }
          }
          } else {
            // No authenticated user in the session
            if (mountedRef.current) setUser(null);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  // Update presence periodically
  useEffect(() => {
    if (!user) return;

    const updatePresence = async () => {
      try {
        // Use working client for presence updates
        const client = await getWorkingClient()
        const { error } = await client.rpc('update_user_last_active')
        if (error) console.error('Error updating presence:', error)
      } catch (error) {
        console.error('Failed to update presence:', error)
      }
    };
    
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
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign in failed');
      throw error;
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
      
      // If user is auto-confirmed (has session), set user immediately
      if (result.session && result.profile) {
        setUser(result.profile);
      } else if (result.user && !result.session) {
        // Don't set user yet, they need to confirm email
      }
      
      return result;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign up failed');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    setError(null);
    try {
      await authSignOut();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign out failed');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;

    try {
      const updatedUser = await updateUserProfile(updates);
      setUser(updatedUser);
      return updatedUser;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Profile update failed');
      throw error;
    }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    try {
      const url = await uploadUserAvatar(file);
      setUser(prev => (prev ? { ...prev, avatar_url: url } : prev));
      return url;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Avatar upload failed');
      throw error;
    }
  };

  const uploadBanner = async (file: File) => {
    if (!user) return;
    try {
      const url = await uploadUserBanner(file);
      setUser(prev => (prev ? { ...prev, banner_url: url } : prev));
      return url;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Banner upload failed');
      throw error;
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

