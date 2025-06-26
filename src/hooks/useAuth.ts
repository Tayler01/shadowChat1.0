import { useEffect, useState, useRef } from 'react';
import { supabase, User, updateUserPresence } from '../lib/supabase';
import { signIn as authSignIn, signUp as authSignUp, signOut as authSignOut, getCurrentUser, updateUserProfile } from '../lib/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    
    // Get initial session
    const getInitialSession = async () => {
      if (initialLoadComplete) return;
      
      console.log('🔍 useAuth: Getting initial session...');
      
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        // Handle the specific "user not found" error from invalid JWT
        if (sessionError && sessionError.message?.includes('User from sub claim in JWT does not exist')) {
          console.log('🧹 useAuth: Invalid JWT detected, clearing session...');
          await supabase.auth.signOut();
          if (mountedRef.current) setUser(null);
          return;
        }
        
        if (sessionError) {
          console.error('useAuth: Session error:', sessionError);
          if (mountedRef.current) {
            setError(sessionError.message);
            setUser(null);
          }
          return;
        }
        
        console.log('📋 useAuth: Session data:', session ? 'Session exists' : 'No session');
        
        if (session?.user) {
          console.log('👤 useAuth: User found in session, getting profile...');
          try {
            const profile = await getCurrentUser();
            console.log('📝 useAuth: Profile result:', profile ? 'Profile loaded' : 'No profile');
            if (mountedRef.current) {
              setUser(profile);
            }
          } catch (error) {
            console.error('useAuth: Failed to get user profile during initial session:', error);
            if (mountedRef.current) {
              setError('Failed to load user profile. Please try refreshing the page.');
              setUser(null);
            }
          }
        } else {
          console.log('❌ useAuth: No user in session');
          if (mountedRef.current) {
            setUser(null);
          }
        }
      } catch (error) {
        console.error('useAuth: Error getting initial session:', error);
        
        // Check if this is the specific "user not found" error from invalid JWT
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('User from sub claim in JWT does not exist')) {
          console.log('🧹 useAuth: Invalid JWT detected, clearing session...');
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
        console.log('✅ useAuth: Initial session check complete');
        if (mountedRef.current) {
          setLoading(false);
          setInitialLoadComplete(true);
        }
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Skip if we're still doing initial load or component is unmounted
        if (!initialLoadComplete || !mountedRef.current) {
          return;
        }

        console.log('🔄 useAuth: Auth state change:', event);
        
        if (event === 'SIGNED_OUT') {
          console.log('👋 useAuth: User signed out');
          if (mountedRef.current) setUser(null);
        } else if (session?.user) {
          console.log('👤 useAuth: User in auth change, getting profile...');
          try {
            const profile = await getCurrentUser();
            console.log('📝 useAuth: Profile in auth change:', profile ? 'Profile loaded' : 'No profile');
            if (profile) {
              if (mountedRef.current) setUser(profile);
            } else {
              console.log('❌ useAuth: Failed to get profile, keeping user as null');
              if (mountedRef.current) setUser(null);
            }
          } catch (error) {
            console.error('useAuth: Failed to get user profile during auth change:', error);
            if (mountedRef.current) {
              setError('Failed to load user profile. Please try signing in again.');
              setUser(null);
            }
          }
        } else {
          // No authenticated user in the session
          console.log('❌ useAuth: No user in auth change');
          if (mountedRef.current) setUser(null);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [initialLoadComplete]);

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