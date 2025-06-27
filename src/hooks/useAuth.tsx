import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase, User, updateUserPresence, forceSessionRefresh } from '../lib/supabase';
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

  // Add logging for state changes
  useEffect(() => {
    console.log('🔐 [AUTH] State changed:', {
      hasUser: !!user,
      userId: user?.id,
      username: user?.username,
      loading,
      error,
      timestamp: new Date().toISOString()
    });
  }, [user, loading, error]);
  useEffect(() => {
    mountedRef.current = true;
    
    // Get initial session
    const getInitialSession = async () => {
      if (initialLoadRef.current) return;
      
      console.log('🔐 [AUTH] getInitialSession: Starting initial session check');
      
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        console.log('🔐 [AUTH] getInitialSession: Session retrieved:', {
          hasSession: !!session,
          hasUser: !!session?.user,
          userId: session?.user?.id,
          hasError: !!sessionError,
          errorMessage: sessionError?.message
        });
        
        // Handle the specific "user not found" error from invalid JWT
        if (sessionError && sessionError.message?.includes('User from sub claim in JWT does not exist')) {
          console.log('🔐 [AUTH] getInitialSession: Invalid JWT detected, signing out');
          await supabase.auth.signOut();
          if (mountedRef.current) setUser(null);
          return;
        }
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          if (mountedRef.current) {
            console.log('🔐 [AUTH] getInitialSession: Setting error state');
            setError(sessionError.message);
            setUser(null);
          }
          return;
        }
        
        
        if (session?.user) {
          console.log('🔐 [AUTH] getInitialSession: User found in session, fetching profile');
          try {
            const profile = await getCurrentUser();
            if (mountedRef.current) {
              console.log('🔐 [AUTH] getInitialSession: Setting user profile:', {
                hasProfile: !!profile,
                userId: profile?.id,
                username: profile?.username
              });
              setUser(profile);
            }
          } catch (error) {
            console.error('Failed to get user profile during initial session:', error);
            if (mountedRef.current) {
              console.log('🔐 [AUTH] getInitialSession: Failed to get profile, setting error');
              setError('Failed to load user profile. Please try refreshing the page.');
              setUser(null);
            }
          }
        } else {
          console.log('🔐 [AUTH] getInitialSession: No user in session, setting user to null');
          if (mountedRef.current) {
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
        
        // Check if this is the specific "user not found" error from invalid JWT
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('User from sub claim in JWT does not exist')) {
          console.log('🔐 [AUTH] getInitialSession: Invalid JWT in catch block, signing out');
          // Clear the invalid session
          await authSignOut();
          if (mountedRef.current) setUser(null);
          // Don't set this as an error since it's expected behavior
        } else {
          console.log('🔐 [AUTH] getInitialSession: Unexpected error, setting error state');
          if (mountedRef.current) {
            setError(errorMessage);
            setUser(null);
          }
        }
      } finally {
        console.log('🔐 [AUTH] getInitialSession: Setting loading to false');
        if (mountedRef.current) {
          setLoading(false);
        }
        initialLoadRef.current = true;
      }
    };

    getInitialSession();

    // Listen for auth changes
    console.log('🔐 [AUTH] Setting up onAuthStateChange listener');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 [AUTH] onAuthStateChange triggered:', {
          event,
          hasSession: !!session,
          hasUser: !!session?.user,
          userId: session?.user?.id,
          initialLoadComplete: initialLoadRef.current,
          componentMounted: mountedRef.current,
          timestamp: new Date().toISOString()
        });
        
        // Skip if we're still doing initial load or component is unmounted

          if (!initialLoadRef.current || !mountedRef.current) {
            console.log('🔐 [AUTH] onAuthStateChange: Skipping due to initial load or unmounted component');
            return;
          }

        
          if (event === 'SIGNED_OUT') {
            console.log('🔐 [AUTH] onAuthStateChange: SIGNED_OUT event detected, setting user to null');
            if (mountedRef.current) setUser(null);
          } else if (session?.user) {
            console.log('🔐 [AUTH] onAuthStateChange: User session detected, fetching profile');
            try {
              const profile = await getCurrentUser();
              if (profile) {
                console.log('🔐 [AUTH] onAuthStateChange: Profile fetched successfully, setting user');
                if (mountedRef.current) setUser(profile);
              } else {
                console.log('🔐 [AUTH] onAuthStateChange: No profile returned, setting user to null');
                if (mountedRef.current) setUser(null);
              }
          } catch (error) {
            console.error('Failed to get user profile during auth change:', error);
            if (mountedRef.current) {
              console.log('🔐 [AUTH] onAuthStateChange: Error fetching profile, setting error state');
              setError('Failed to load user profile. Please try signing in again.');
              setUser(null);
            }
          }
          } else {
            // No authenticated user in the session
            console.log('🔐 [AUTH] onAuthStateChange: No user in session, setting user to null');
            if (mountedRef.current) setUser(null);
        }
      }
    );

    return () => {
      console.log('🔐 [AUTH] Cleaning up auth listener and setting mounted to false');
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
        console.log('🔄 [AUTH] Page became visible, attempting forceSessionRefresh...');
        // Use forceSessionRefresh instead of the problematic supabase.auth.refreshSession
        forceSessionRefresh()
          .then((success) => {
            if (!success) {
              console.warn('🔄 [AUTH] forceSessionRefresh failed, signing out user');
              // If session refresh fails, sign out the user to clear invalid state
              signOut().catch((signOutErr) => {
                console.error('🔄 [AUTH] Error during signOut after failed refresh:', signOutErr);
              });
            }
          })
          .catch((err) => {
            console.error('🔄 [AUTH] Error with forceSessionRefresh on visibility change:', err);
            // If there's an exception, also sign out to clear invalid state
            signOut().catch((signOutErr) => {
              console.error('🔄 [AUTH] Error during signOut after refresh exception:', signOutErr);
            });
          });
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
    console.log('🔐 [AUTH] signIn: Starting sign in process');
    setLoading(true);
    setError(null);
    try {
      await authSignIn({ email, password });
      console.log('🔐 [AUTH] signIn: Sign in completed successfully');
    } catch (error) {
      console.error('🔐 [AUTH] signIn: Sign in failed:', error);
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
    console.log('🔐 [AUTH] signUp: Starting sign up process');
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
        console.log('🔐 [AUTH] signUp: Auto-confirmed user, setting profile');
        setUser(result.profile);
      } else if (result.user && !result.session) {
        console.log('🔐 [AUTH] signUp: User needs email confirmation');
        // Don't set user yet, they need to confirm email
      }
      
      console.log('🔐 [AUTH] signUp: Sign up completed successfully');
      return result;
    } catch (error) {
      console.error('🔐 [AUTH] signUp: Sign up failed:', error);
      setError(error instanceof Error ? error.message : 'Sign up failed');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    console.log('🔐 [AUTH] signOut: Starting sign out process');
    setLoading(true);
    setError(null);
    try {
      await authSignOut();
      console.log('🔐 [AUTH] signOut: Sign out completed successfully');
    } catch (error) {
      console.error('🔐 [AUTH] signOut: Sign out failed:', error);
      setError(error instanceof Error ? error.message : 'Sign out failed');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    if (!user) return;
    
    console.log('🔐 [AUTH] updateProfile: Starting profile update');
    try {
      const updatedUser = await updateUserProfile(updates);
      console.log('🔐 [AUTH] updateProfile: Profile updated successfully');
      setUser(updatedUser);
      return updatedUser;
    } catch (error) {
      console.error('🔐 [AUTH] updateProfile: Profile update failed:', error);
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

