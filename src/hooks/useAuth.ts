import { useEffect, useState, useRef } from 'react';
import { supabase, User, updateUserPresence } from '../lib/supabase';
import { signIn as authSignIn, signUp as authSignUp, signOut as authSignOut, getCurrentUser, updateUserProfile } from '../lib/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(false);
  const processingRef = useRef(false);
  const authChangeCountRef = useRef(0);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      if (initialLoadRef.current || processingRef.current) return;
      
      console.log('🔍 Getting initial session...');
      processingRef.current = true;
      
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        // Handle the specific "user not found" error from invalid JWT
        if (sessionError && sessionError.message?.includes('User from sub claim in JWT does not exist')) {
          console.log('🧹 Invalid JWT detected in getSession, clearing session...');
          await supabase.auth.signOut();
          setUser(null);
          return;
        }
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          setError(sessionError.message);
          setUser(null);
          return;
        }
        
        console.log('📋 Session data:', session ? 'Session exists' : 'No session');
        
        if (session?.user) {
          console.log('👤 User found in session, getting profile...');
          const profile = await getCurrentUser();
          console.log('📝 Profile result:', profile ? 'Profile loaded' : 'No profile');
          setUser(profile);
        } else {
          console.log('❌ No user in session');
          setUser(null);
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
        
        // Check if this is the specific "user not found" error from invalid JWT
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('User from sub claim in JWT does not exist')) {
          console.log('🧹 Invalid JWT detected, clearing session...');
          // Clear the invalid session
          await authSignOut();
          setUser(null);
          // Don't set this as an error since it's expected behavior
        } else {
          setError(errorMessage);
          setUser(null);
        }
      } finally {
        console.log('✅ Initial session check complete, setting loading to false');
        setLoading(false);
        initialLoadRef.current = true;
        processingRef.current = false;
      }
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Skip if we're still doing initial load
        if (!initialLoadRef.current) {
          console.log('⏭️ Skipping auth change during initial load or processing');
          return;
        }

        // Debounce rapid auth changes
        authChangeCountRef.current += 1;
        const currentCount = authChangeCountRef.current;
        
        // Wait a bit to see if more changes come in
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // If more changes came in, skip this one
        if (currentCount !== authChangeCountRef.current) {
          console.log('⏭️ Skipping auth change due to newer change');
          return;
        }
        
        // Skip if already processing
        if (processingRef.current) {
          console.log('⏭️ Skipping auth change - already processing');
          return;
        }

        console.log('🔄 Auth state change:', event);
        processingRef.current = true;
        
        try {
          if (event === 'SIGNED_OUT') {
            console.log('👋 User signed out');
            setUser(null);
          } else if (session?.user) {
            console.log('👤 User in auth change, getting profile...');
            const profile = await getCurrentUser();
            console.log('📝 Profile in auth change:', profile ? 'Profile loaded' : 'No profile');
            if (profile) {
              setUser(profile);
            } else {
              console.log('❌ Failed to get profile, keeping user as null');
              setUser(null);
            }
          } else {
            console.log('❌ No user in auth change');
            setUser(null);
          }
        } catch (error) {
          console.error('Error in auth state change:', error);
          setError(error instanceof Error ? error.message : 'Unknown error');
          setUser(null);
        } finally {
          processingRef.current = false;
        }
      }
    );

    return () => subscription.unsubscribe();
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
    loading,
    error,
    signIn,
    signUp,
    signOut,
    updateProfile,
  };
}