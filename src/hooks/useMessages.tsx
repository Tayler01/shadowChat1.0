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
        // console.error('❌ Error fetching messages:', error);
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
      // console.error('❌ Exception fetching messages:', error);
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
              // console.error('❌ Error fetching new message details:', error);
              return;
            }

            if (newMessage) {
              // Log received message with clear indication if it's from another user
              const isFromCurrentUser = newMessage.user_id === user.id;
              const logPrefix = isFromCurrentUser ? '📨 [REALTIME-SELF]' : '📨 [REALTIME-OTHER]';
              console.log(`${logPrefix} Message received:`, {
                id: newMessage.id,
                content: newMessage.content,
                from: newMessage.user?.display_name || 'Unknown',
                userId: newMessage.user_id,
                isFromMe: isFromCurrentUser,
                timestamp: newMessage.created_at
              });

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
            // console.error('❌ Exception handling new message:', error);
          }
        }
      )
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const newMessage = payload.payload as Message
        
        // Log broadcast message with clear indication if it's from another user
        const isFromCurrentUser = newMessage.user_id === user.id;
        const logPrefix = isFromCurrentUser ? '📡 [BROADCAST-SELF]' : '📡 [BROADCAST-OTHER]';
        console.log(`${logPrefix} Broadcast message received:`, {
          id: newMessage.id,
          content: newMessage.content,
          from: newMessage.user?.display_name || 'Unknown',
          userId: newMessage.user_id,
          isFromMe: isFromCurrentUser,
          timestamp: newMessage.created_at
        });
        
        setMessages(prev => {
          const exists = prev.find(m => m.id === newMessage.id)
          if (exists) return prev
          return [...prev, newMessage]
        })
      })
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
              // console.error('❌ Error fetching updated message:', error);
              return;
            }

            if (updatedMessage) {
              setMessages(prev =>
                prev.map(msg => msg.id === updatedMessage.id ? updatedMessage as Message : msg)
              );
            }
          } catch (error) {
            // console.error('❌ Exception handling message update:', error);
          }
        }
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
          // console.error('❌ Real-time subscription error:', err);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // console.warn(`⚠️ Channel ${status}, removing and resubscribing...`);
          await supabase.removeChannel(newChannel);
          setTimeout(() => {
            channel = subscribeToChannel();
          }, 1000);
        } else if (status === 'CLOSED') {
          // console.warn('⚠️ Channel closed, resubscribing...');
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
        // supabase.auth.refreshSession().catch(err => {
        //   console.error('Error refreshing session on visibility change:', err)
        // })
        if (channel && channel.state !== 'joined') {
          supabase.removeChannel(channel)
          channel = subscribeToChannel()
        }
        fetchMessages()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (channel) supabase.removeChannel(channel)
      channelRef.current = null
    };
  }, [user, fetchMessages]);

  const sendMessage = useCallback(async (content: string, messageType: 'text' | 'command' = 'text') => {
    const timestamp = new Date().toISOString();
    const logPrefix = `🚀 [${timestamp}] MESSAGE_SEND`;

    console.log(`${logPrefix}: Called`, {
      hasUser: !!user,
      userId: user?.id,
      content
    });

    if (!user || !content.trim()) {
      console.warn(`${logPrefix}: Skipped send — missing user or empty content`, { hasUser: !!user, content, userId: user?.id });
      return;
    }

    setSending(true);

    // Ensure we have a valid session before attempting database operations
    const sessionValid = await ensureSession();
    console.log(`${logPrefix}: After ensureSession`, {
      sessionValid,
      hasUser: !!user,
      userId: user?.id,
    });
    if (!sessionValid) {
      console.error(`${logPrefix}: ❌ Invalid or expired session, cannot send message`);
      throw new Error('Authentication session is invalid or expired. Please refresh the page and try again.');
    }

    // Log current session tokens and user details for debugging
    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log(`${logPrefix}: Session details`, {
        access_token: session?.access_token,
        refresh_token: session?.refresh_token,
        userId: session?.user?.id,
      });
    } catch (tokenErr) {
      console.error(`${logPrefix}: Failed to get session tokens`, tokenErr);
    }

    try {
      // Step 1: Prepare message data

      const messageData = {
        user_id: user.id,
        content: content.trim(),
        message_type: messageType,
      };
      console.log(`${logPrefix}: Prepared message data`, messageData)

      // Step 2: Attempt database insert (let Supabase handle auth internally)
      const insertStartTime = performance.now();
      
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

      console.log(`${logPrefix}: Insert response`, { duration: insertDuration, data, error });

      // Insert result logged for debugging

      if (error) {
        console.error(`${logPrefix}: ❌ Database insert failed:`, error);
        
        // Step 3: Handle auth errors with retry
        if (error.status === 401 || /jwt|token|expired/i.test(error.message)) {
          const retryRefreshStartTime = performance.now();
          
          // Try refreshing the session
          const refreshPromise = supabase.auth.refreshSession();
          const refreshTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Session refresh timeout after 5 seconds')), 5000)
          );
          
          const { data: refreshData, error: refreshError } = await Promise.race([refreshPromise, refreshTimeoutPromise]) as any;
          const retryRefreshEndTime = performance.now();
          const retryRefreshDuration = retryRefreshEndTime - retryRefreshStartTime;
          console.log(`${logPrefix}: Session refresh duration`, retryRefreshDuration);
          
          
          if (!refreshError && refreshData.session) {
            const retryInsertStartTime = performance.now();
            
            const retryPromise = supabase
              .from('messages')
              .insert(messageData)
              .select(`
                *,
                user:users!user_id(*)
              `)
              .single();
              
            const retryTimeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Retry database insert timeout after 10 seconds')), 10000)
            );
            
            const retry = await Promise.race([retryPromise, retryTimeoutPromise]) as any;
            const retryInsertEndTime = performance.now();
            const retryInsertDuration = retryInsertEndTime - retryInsertStartTime;
            console.log(`${logPrefix}: Retry insert duration`, retryInsertDuration);
            
            
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

      // Message successfully inserted

      // Step 4: Update local state and broadcast
      if (data) {
        setMessages(prev => {
          const exists = prev.find(m => m.id === data.id)
          if (exists) {
            return prev;
          }
          return [...prev, data as Message];
        })
        
        const broadcastResult = channelRef.current?.send({
          type: 'broadcast',
          event: 'new_message',
          payload: data
        });
        console.log(`${logPrefix}: Broadcast result`, broadcastResult);
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
        // console.error('❌ Error editing message:', error);
        throw error;
      }

    } catch (error) {
      // console.error('❌ Exception editing message:', error);
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
        // console.error('❌ Error deleting message:', error);
        throw error;
      }

    } catch (error) {
      // console.error('❌ Exception deleting message:', error);
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
        // console.error('❌ Error toggling reaction:', error);
        throw error;
      }

    } catch (error) {
      // console.error('❌ Exception toggling reaction:', error);
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
        // console.error('❌ Message not found for pin toggle');
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
        // console.error('❌ Error toggling pin:', error);
        throw error;
      }

    } catch (error) {
      // console.error('❌ Exception toggling pin:', error);
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
