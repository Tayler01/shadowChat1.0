import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef
} from 'react';
import { supabase, Message, ensureSession } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from './useAuth';

interface MessagesContextValue {
  messages: Message[];
  loading: boolean;
  sending: boolean;
  sendMessage: (content: string, type?: 'text' | 'command') => Promise<void>;
  editMessage: (id: string, content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  toggleReaction: (id: string, emoji: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
}

const MessagesContext = createContext<MessagesContextValue | undefined>(undefined);

function useProvideMessages(): MessagesContextValue {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          user:users!user_id(*)
        `)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
      } else if (data) {
        setMessages(prev => {
          if (prev.length === 0) {
            return data as Message[];
          }
          const ids = new Set(prev.map(m => m.id));
          const merged = [...prev, ...data.filter(m => !ids.has(m.id))];
          return merged;
        });
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch initial messages
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) {
      return;
    }


    // Use a static channel name to prevent duplicate subscriptions
    const channelName = 'public:messages';

    let channel: RealtimeChannel | null = null;

    const subscribeToChannel = (): RealtimeChannel => {
      const newChannel = supabase
        .channel(channelName, {
          config: {
            broadcast: { self: true },
            presence: { key: user.id }
          }
        })
        .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          
          try {
            // Fetch the complete message with user data
            const { data: newMessage, error } = await supabase
              .from('messages')
              .select(`
                *,
                user:users!user_id(*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (error) {
              return;
            }

            if (newMessage) {
              setMessages(prev => {
                // Check if message already exists to avoid duplicates
                const exists = prev.find(msg => msg.id === newMessage.id);
                if (exists) {
                  return prev;
                }
                
                // Add new message to the end
                const updated = [...prev, newMessage as Message];
                
                // Force a new array reference to ensure React detects the change
                return updated.slice();
              });
            }
          } catch (error) {
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          
          try {
            // Fetch the updated message with user data
            const { data: updatedMessage, error } = await supabase
              .from('messages')
              .select(`
                *,
                user:users!user_id(*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (error) {
              return;
            }

            if (updatedMessage) {
              setMessages(prev =>
                prev.map(msg => msg.id === updatedMessage.id ? updatedMessage as Message : msg)
              );
            }
          } catch (error) {
          }
        // Don't await the broadcast - make it non-blocking
        channelRef.current?.send({
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          setMessages(prev =>
            prev.filter(msg => msg.id !== payload.old.id)
          );
        }
      )
      .subscribe(async (status, err) => {
        if (err) {
        }
        if (status === 'SUBSCRIBED') {
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          await supabase.removeChannel(newChannel);
          setTimeout(() => {
            channel = subscribeToChannel();
          }, 1000);
        } else if (status === 'CLOSED') {
          setTimeout(() => {
            channel = subscribeToChannel();
          }, 1000);
        }
      });

      return newChannel;
    };

    channel = subscribeToChannel();
    channelRef.current = channel;

    const handleVisibility = () => {
      if (!document.hidden) {
        console.log('🔄 Messages: Page became visible, refreshing session...');
        
        if (channel && channel.state !== 'joined') {
          console.log('🔄 Messages: Reconnecting channel...');
          supabase.removeChannel(channel);
          channel = subscribeToChannel();
        }
        
        fetchMessages();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (channel) supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user, fetchMessages]);

  const sendMessage = useCallback(async (content: string, messageType: 'text' | 'command' = 'text') => {
    const timestamp = new Date().toISOString();
    const logPrefix = `🚀 [${timestamp}] MESSAGE_SEND`;
    
    console.log(`${logPrefix}: Starting message send process`);
    
    // Get current user from session
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUser = sessionData?.session?.user;

    console.log(`${logPrefix}: Current user:`, currentUser?.id);

    if (!currentUser || !content.trim()) {
      console.error(`${logPrefix}: ❌ No user or empty content`);
      return;
    }

    setSending(true);

    try {
      // Step 1: Prepare message data
      console.log(`${logPrefix}: Preparing message data`);
      const messageData = {
        user_id: currentUser.id,
        content: content.trim(),
        message_type: messageType,
      };

      // Step 2: Attempt database insert (let Supabase handle auth internally)
      const insertStartTime = performance.now();
      console.log(`${logPrefix}: Attempting database insert`);
      const insertPromise = supabase
        .from('messages')
        .insert(messageData)
        .select(`
          *,
          user:users!user_id(*)
        `)
        .single();
        
      const insertTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database insert timeout after 10 seconds')), 10000)
      );
      
      let { data, error } = await Promise.race([insertPromise, insertTimeoutPromise]) as any;
      const insertEndTime = performance.now();
      const insertDuration = insertEndTime - insertStartTime;
      
      console.log(`${logPrefix}: Insert completed in ${insertDuration}ms`, { data: !!data, error: !!error });

      if (error) {
        console.error(`${logPrefix}: ❌ Database insert failed:`, error);
        
        // Step 3: Handle auth errors with retry
        if (error.status === 401 || /jwt|token|expired/i.test(error.message)) {
          console.log(`${logPrefix}: Attempting session refresh due to auth error`);
          
          // Try refreshing the session
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          
          if (!refreshError && refreshData.session) {
            console.log(`${logPrefix}: Retrying insert with refreshed session`);
            
            const retryPromise = supabase
              .from('messages')
              .insert(messageData)
              .select(`
                *,
                user:users!user_id(*)
              `)
              .single();
              
            const retry = await retryPromise;
            
            data = retry.data;
            error = retry.error;
          } else {
            console.error(`${logPrefix}: ❌ Session refresh failed, cannot retry`);
          }
        }
        
        if (error) {
          console.error(`${logPrefix}: ❌ Final error after retry:`, error);
          throw error;
        }
      }

      // Step 4: Update local state and broadcast
      if (data) {
        console.log(`${logPrefix}: ✅ Message sent successfully, updating local state`);
        setMessages(prev => {
          const exists = prev.find(m => m.id === data.id);
          if (exists) {
            console.log(`${logPrefix}: Message already exists in local state`);
            return prev;
          }
          console.log(`${logPrefix}: Adding message to local state`);
          return [...prev, data as Message];
        });
        
        // Don't await the broadcast - make it non-blocking
        channelRef.current?.send({
          type: 'broadcast',
          event: 'new_message',
          payload: data
        }).then(result => {
          console.log(`${logPrefix}: Broadcast completed:`, result);
        }).catch(err => {
          console.warn(`${logPrefix}: Broadcast failed (non-critical):`, err);
        });
        
        console.log(`${logPrefix}: Message processing complete`);
        }).catch(err => {
          console.warn(`${logPrefix}: Broadcast failed (non-critical):`, err);
        });
        
        console.log(`${logPrefix}: Message processing complete`);
      }
      
    } catch (error) {
      console.error(`${logPrefix}: ❌ Exception in send process:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userAvailable: !!user,
        networkOnline: navigator.onLine,
        error
      });
      throw error;
    } finally {
      setSending(false);
    }
  }, [user]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!user) return;


    try {
      const { error } = await supabase
        .from('messages')
        .update({
          content,
          edited_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

    } catch (error) {
      throw error;
    }
  }, [user]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return;


    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

    } catch (error) {
      throw error;
    }
  }, [user]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;


    try {
      const { error } = await supabase.rpc('toggle_message_reaction', {
        message_id: messageId,
        emoji: emoji,
        is_dm: false
      });

      if (error) {
        throw error;
      }

    } catch (error) {
      throw error;
    }
  }, [user]);

  const togglePin = useCallback(async (messageId: string) => {
    if (!user) return;


    try {
      // First get the current pinned status
      const { data: message } = await supabase
        .from('messages')
        .select('pinned')
        .eq('id', messageId)
        .single();

      if (!message) {
        return;
      }

      const isPinned = message.pinned;
      
      const { error } = await supabase
        .from('messages')
        .update({
          pinned: !isPinned,
          pinned_by: !isPinned ? user.id : null,
          pinned_at: !isPinned ? new Date().toISOString() : null,
        })
        .eq('id', messageId);

      if (error) {
        throw error;
      }

    } catch (error) {
      throw error;
    }
  }, [user]);

  return {
    messages,
    loading,
    sending,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    togglePin,
  };
}

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideMessages();
  return (
    <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>
  );
}

export function useMessages() {
  const context = useContext(MessagesContext);
  if (!context) {
    throw new Error('useMessages must be used within a MessagesProvider');
  }
  return context;
}