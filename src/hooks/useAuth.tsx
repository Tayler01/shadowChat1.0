import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase, User, updateUserPresence } from '../lib/supabase';
import { signIn as authSignIn, signUp as authSignUp, signOut as authSignOut, getCurrentUser, updateUserProfile } from '../lib/auth';

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
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function useProvideAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(false);
  const mountedRef = useRef(true);

  const refreshSessionOnFocus = async () => {
    console.log('🔄 Refreshing session and profile on focus...');
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      console.log('🔍 Session from getSession on focus:', session);

      if (
        sessionError &&
        sessionError.message?.includes('User from sub claim in JWT does not exist')
      ) {
        console.log('🧹 Invalid JWT detected during focus refresh, clearing session...');
        await supabase.auth.signOut();
        const { data: cleared } = await supabase.auth.getSession();
        console.log('✅ Post-signOut session:', cleared.session);
        if (mountedRef.current) setUser(null);
        return;
      }

      if (sessionError) {
        console.error('Session error during focus refresh:', sessionError);
        if (mountedRef.current) {
          setError(sessionError.message);
          setUser(null);
        }
        return;
      }

      if (session?.user) {
        try {
          const profile = await getCurrentUser();
          if (mountedRef.current) setUser(profile);
        } catch (err) {
          console.error('Failed to load profile during focus refresh:', err);
          if (mountedRef.current) {
            setError('Failed to load user profile.');
            setUser(null);
          }
        }
      } else if (mountedRef.current) {
        console.log('🚫 No session found on focus, clearing user state');
        setUser(null);
      }
    } catch (err) {
      console.error('Unexpected error during focus refresh:', err);
      if (mountedRef.current) setUser(null);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    
    // Get initial session
    const getInitialSession = async () => {
      if (initialLoadRef.current) return;
      
      console.log('🔍 Getting initial session...');
      
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        // Handle the specific "user not found" error from invalid JWT
        if (sessionError && sessionError.message?.includes('User from sub claim in JWT does not exist')) {
          console.log('🧹 Invalid JWT detected in getSession, clearing session...');
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
        
        console.log('📋 Session data:', session ? 'Session exists' : 'No session');
        
        if (session?.user) {
          console.log('👤 User found in session, getting profile...');
          try {
            const profile = await getCurrentUser();
            console.log('📝 Profile result:', profile ? 'Profile loaded' : 'No profile');
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
          console.log('❌ No user in session');
          if (mountedRef.current) {
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
        
        // Check if this is the specific "user not found" error from invalid JWT
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('User from sub claim in JWT does not exist')) {
          console.log('🧹 Invalid JWT detected, clearing session...');
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
        console.log('✅ Initial session check complete, setting loading to false');
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
          console.log('⏭️ Skipping auth change during initial load or unmounted');
          return;
        }

        console.log('🔄 Auth state change:', event);
        
        if (event === 'SIGNED_OUT') {
          console.log('👋 User signed out');
          if (mountedRef.current) setUser(null);
        } else if (session?.user) {
          console.log('👤 User in auth change, getting profile...');
          try {
            const profile = await getCurrentUser();
            console.log('📝 Profile in auth change:', profile ? 'Profile loaded' : 'No profile');
            if (profile) {
              if (mountedRef.current) setUser(profile);
            } else {
              console.log('❌ Failed to get profile, keeping user as null');
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
          console.log('❌ No user in auth change');
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

    const updatePresence = () => updateUserPresence();
    
    // Update immediately
    updatePresence();
    
    // Update every 30 seconds
    const interval = setInterval(updatePresence, 30000);
    
    // Update on page visibility change
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('👀 Page visible, refreshing session and presence');
        refreshSessionOnFocus()
          .then(() => console.log('🌟 Session refresh complete'))
          .catch((err) => {
            console.error('Error refreshing session on visibility change:', err);
          });
        updatePresence();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
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
        console.log('✅ Auto-login after signup successful');
        setUser(result.profile);
      } else if (result.user && !result.session) {
        console.log('📧 Email confirmation required');
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

  return {
    user,
    profile: user, // Add profile alias for backward compatibility
    loading,
    error,
    signIn,
    signUp,
    signOut,
    updateProfile,
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

