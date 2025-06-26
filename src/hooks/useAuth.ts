import { useEffect, useState } from 'react';
import { supabase, User, updateUserPresence } from '../lib/supabase';
import { signIn as authSignIn, signUp as authSignUp, signOut as authSignOut, getCurrentUser, updateUserProfile } from '../lib/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      console.log('🔍 Getting initial session...');
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
      }
      
      console.log('✅ Initial session check complete, setting loading to false');
      setLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Auth state change:', event);
        try {
          if (session?.user) {
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
        }
        setLoading(false);
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
    try {
      await authSignIn({ email, password });
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
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await authSignOut();
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;
    
    const updatedUser = await updateUserProfile(updates);
    setUser(updatedUser);
    return updatedUser;
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