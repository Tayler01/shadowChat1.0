import { useEffect, useState, useRef } from 'react';
import { supabase, User, updateUserPresence } from '../lib/supabase';
import { signIn as authSignIn, signUp as authSignUp, signOut as authSignOut, getCurrentUser, updateUserProfile } from '../lib/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(false);
  const processingRef = useRef(false);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      if (initialLoadRef.current || processingRef.current) return;
      
      console.log('🔍 Getting initial session...');
      processingRef.current = true;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
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
        setError(error instanceof Error ? error.message : 'Unknown error');
        setUser(null);
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
        // Skip if we're still doing initial load or already processing
        if (!initialLoadRef.current || processingRef.current) {
          console.log('⏭️ Skipping auth change during initial load or processing');
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
            setUser(profile);
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
      const profile = await authSignUp({
        email,
        password,
        username: userData.username,
        displayName: userData.full_name,
      });
      if (profile) {
        setUser(profile);
      }
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