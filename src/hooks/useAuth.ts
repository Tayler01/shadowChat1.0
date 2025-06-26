import { useEffect, useState } from 'react';
import { supabase, User } from '../lib/supabase';
import { AuthService, SignUpData } from '../lib/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const profile = await AuthService.getCurrentUser();
        setUser(profile);
      }
      
      setLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const profile = await AuthService.getCurrentUser();
          setUser(profile);
        } else {
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

    const updatePresence = () => AuthService.updatePresence();
    
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
      await AuthService.signIn(email, password);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, userData: { full_name: string; username: string }) => {
    setLoading(true);
    try {
      const data: SignUpData = {
        email,
        password,
        username: userData.username,
        displayName: userData.full_name,
      };
      await AuthService.signUp(data);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await AuthService.signOut();
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;
    
    const updatedUser = await AuthService.updateProfile(updates);
    setUser(updatedUser);
    return updatedUser;
  };

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
  };
}