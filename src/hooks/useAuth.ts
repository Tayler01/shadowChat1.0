import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AuthService, SignUpData } from '../lib/auth';

interface AuthUser {
  id: string;
  email: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  banner_url?: string;
  status?: string;
  status_message?: string;
  color?: string;
  last_active?: string;
  created_at?: string;
  updated_at?: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          await supabase.auth.signOut();
          setUser(null);
          setLoading(false);
          return;
        }
        
        if (session?.user) {
          try {
            // Get user profile from database
            const { data: profile, error: profileError } = await supabase
              .from('users')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profileError || !profile) {
              console.error('Profile error:', profileError);
              // User exists in auth but not in users table, sign them out
              await supabase.auth.signOut();
              setUser(null);
            } else {
              setUser(profile);
            }
          } catch (error) {
            console.error('Error fetching profile:', error);
            await supabase.auth.signOut();
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        await supabase.auth.signOut();
        setUser(null);
      }
      
      setLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          if (session?.user) {
            // Get user profile from database
            const { data: profile, error: profileError } = await supabase
              .from('users')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profileError || !profile) {
              console.error('Profile error on auth change:', profileError);
              await supabase.auth.signOut();
              setUser(null);
            } else {
              setUser(profile);
            }
          } else {
            setUser(null);
          }
        } catch (error) {
          console.error('Auth state change error:', error);
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
      await AuthService.signIn({ email, password });
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

  const updateProfile = async (updates: Partial<AuthUser>) => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      
      setUser(data);
      return data;
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  };

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
    profile: user,
  };
}