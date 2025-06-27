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
    const timestamp = new Date().toISOString();
    const logPrefix = `📥 [${timestamp}] FETCH_MESSAGES`;
    
    console.log(`${logPrefix}: Starting message fetch`, {
      hasUser: !!user,
      userId: user?.id,
      currentMessageCount: messages.length
    });

    try {
      console.log(`${logPrefix}: Calling supabase.from('messages').select()`);
      
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          user:users!user_id(*)
        `)
        .order('created_at', { ascending: true })
        .limit(100);

      console.log(`${logPrefix}: Supabase query completed`, {
        hasData: !!data,
        dataLength: data?.length || 0,
        hasError: !!error,
        errorMessage: error?.message,
        errorCode: error?.code
      });

      if (error) {
        console.error(`${logPrefix}: ❌ Error fetching messages:`, error);
      } else if (data) {
        console.log(`${logPrefix}: ✅ Messages fetched successfully`, {
          fetchedCount: data.length,
          messageIds: data.map(m => m.id),
          messageContents: data.map(m => ({ id: m.id, content: m.content.substring(0, 50) + '...' }))
        });

        // TEMPORARY: Replace messages entirely to see if fetch data contains missing messages
        console.log(`${logPrefix}: 🔄 TEMPORARILY replacing entire message state (for debugging)`);
        setMessages(data as Message[]);
        
        // Original logic (commented out for debugging):
        // setMessages(prev => {
        //   if (prev.length === 0) {
        //     return data as Message[];
        //   }
        //   const ids = new Set(prev.map(m => m.id));
        //   const merged = [...prev, ...data.filter(m => !ids.has(m.id))];
        //   return merged;
        // });
      }
    } catch (error) {
      console.error(`${logPrefix}: ❌ Exception fetching messages:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error
      });
    } finally {
      console.log(`${logPrefix}: Setting loading to false`);
      setLoading(false);
    }
  }, [user, messages.length]);

  // Fetch initial messages
  useEffect(() => {
    console.log('📥 [MESSAGES] Initial fetch effect triggered');
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) {
      console.log('📡 [REALTIME] No user, skipping real-time subscription');
      return;
    }

    console.log('📡 [REALTIME] Setting up real-time subscription for user:', user.id);

    // Use a static channel name to prevent duplicate subscriptions
    const channelName = 'public:messages';

    let channel: RealtimeChannel | null = null;

    const subscribeToChannel = (): RealtimeChannel => {
      console.log('📡 [REALTIME] Creating new channel subscription');
      
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
          const timestamp = new Date().toISOString();
          const logPrefix = `📨 [${timestamp}] POSTGRES_INSERT`;
          
          console.log(`${logPrefix}: Received postgres_changes INSERT event`, {
            payloadNew: payload.new,
            messageId: payload.new?.id,
            content: payload.new?.content,
            userId: payload.new?.user_id,
            isFromCurrentUser: payload.new?.user_id === user.id
          });
          
          try {
            // Fetch the complete message with user data
            console.log(`${logPrefix}: Fetching complete message data for ID: ${payload.new.id}`);
            
            const { data: newMessage, error } = await supabase
              .from('messages')
              .select(`
                *,
                user:users!user_id(*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (error) {
              console.error(`${logPrefix}: ❌ Error fetching new message details:`, error);
              return;
            }

            if (newMessage) {
              // Log received message with clear indication if it's from another user
              const isFromCurrentUser = newMessage.user_id === user.id;
              const userLogPrefix = isFromCurrentUser ? '📨 [REALTIME-SELF]' : '📨 [REALTIME-OTHER]';
              console.log(`${userLogPrefix} Message received:`, {
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
                  console.log(`${logPrefix}: Message already exists in state, skipping`);
                  return prev;
                }
                
                // Add new message to the end
                const updated = [...prev, newMessage as Message];
                
                console.log(`${logPrefix}: Adding message to state`, {
                  previousCount: prev.length,
                  newCount: updated.length,
                  addedMessageId: newMessage.id
                });
                
                // Force a new array reference to ensure React detects the change
                return updated.slice();
              });
            }
          } catch (error) {
            console.error(`${logPrefix}: ❌ Exception handling new message:`, error);
          }
        }
      )
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const newMessage = payload.payload as Message
        const timestamp = new Date().toISOString();
        const logPrefix = `📡 [${timestamp}] BROADCAST_MESSAGE`;
        
        // Log broadcast message with clear indication if it's from another user
        const isFromCurrentUser = newMessage.user_id === user.id;
        const userLogPrefix = isFromCurrentUser ? '📡 [BROADCAST-SELF]' : '📡 [BROADCAST-OTHER]';
        console.log(`${userLogPrefix} Broadcast message received:`, {
          id: newMessage.id,
          content: newMessage.content,
          from: newMessage.user?.display_name || 'Unknown',
          userId: newMessage.user_id,
          isFromMe: isFromCurrentUser,
          timestamp: newMessage.created_at
        });
        
        setMessages(prev => {
          const exists = prev.find(m => m.id === newMessage.id)
          if (exists) {
            console.log(`${logPrefix}: Message already exists in state, skipping`);
            return prev
          }
          console.log(`${logPrefix}: Adding broadcast message to state`);
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
          const timestamp = new Date().toISOString();
          const logPrefix = `📝 [${timestamp}] POSTGRES_UPDATE`;
          
          console.log(`${logPrefix}: Received postgres_changes UPDATE event`, {
            payloadNew: payload.new,
            messageId: payload.new?.id
          });
          
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
              console.error(`${logPrefix}: ❌ Error fetching updated message:`, error);
              return;
            }

            if (updatedMessage) {
              console.log(`${logPrefix}: Updating message in state`, {
                messageId: updatedMessage.id,
                content: updatedMessage.content
              });
              
              setMessages(prev =>
                prev.map(msg => msg.id === updatedMessage.id ? updatedMessage as Message : msg)
              );
            }
          } catch (error) {
            console.error(`${logPrefix}: ❌ Exception handling message update:`, error);
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
          const timestamp = new Date().toISOString();
          const logPrefix = `🗑️ [${timestamp}] POSTGRES_DELETE`;
          
          console.log(`${logPrefix}: Received postgres_changes DELETE event`, {
            payloadOld: payload.old,
            messageId: payload.old?.id
          });
          
          setMessages(prev =>
            prev.filter(msg => msg.id !== payload.old.id)
          );
        }
      )
      .subscribe(async (status, err) => {
        const timestamp = new Date().toISOString();
        const logPrefix = `📡 [${timestamp}] CHANNEL_STATUS`;
        
        console.log(`${logPrefix}: Channel status changed`, {
          status,
          error: err?.message,
          channelName
        });
        
        if (err) {
          console.error(`${logPrefix}: ❌ Real-time subscription error:`, err);
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`${logPrefix}: ⚠️ Channel ${status}, removing and resubscribing...`);
          await supabase.removeChannel(newChannel);
          setTimeout(() => {
            channel = subscribeToChannel();
          }, 1000);
        } else if (status === 'CLOSED') {
          console.warn(`${logPrefix}: ⚠️ Channel closed, resubscribing...`);
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
      const timestamp = new Date().toISOString();
      const logPrefix = `👁️ [${timestamp}] VISIBILITY_CHANGE`;
      
      const state = channel?.state
      console.log(`${logPrefix}: Page visibility changed`, { 
        hidden: document.hidden, 
        channelState: state,
        hasChannel: !!channel,
        hasUser: !!user
      })
      
      if (!document.hidden) {
        console.log(`${logPrefix}: Page became visible, checking channel and fetching messages`);
        
        if (channel && channel.state !== 'joined') {
          console.log(`${logPrefix}: 🌀 Resubscribing channel due to state: ${channel.state}`)
          supabase.removeChannel(channel)
          channel = subscribeToChannel()
          channelRef.current = channel
        }
        
        console.log(`${logPrefix}: Calling fetchMessages() due to visibility change`);
        fetchMessages()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      console.log('📡 [REALTIME] Cleaning up real-time subscription');
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
    console.log(`${logPrefix}: Channel state before send`, {
      hasChannel: !!channelRef.current,
      state: channelRef.current?.state,
    })

    // Ensure we have a valid session before attempting database operations
    const sessionValid = await ensureSession();
    console.log(`${logPrefix}: After ensureSession`, {
      sessionValid,
      hasUser: !!user,
      userId: user?.id,
    });
    
    console.log(`${logPrefix}: 🔍 Checking conditions before proceeding to insert`);
    
    if (!sessionValid) {
      console.error(`${logPrefix}: ❌ EARLY EXIT: sessionValid is false`);
      console.error(`${logPrefix}: ❌ Invalid or expired session, cannot send message`);
      throw new Error('Authentication session is invalid or expired. Please refresh the page and try again.');
    }
    
    console.log(`${logPrefix}: ✅ sessionValid check passed`);
    
    if (!user) {
      console.error(`${logPrefix}: ❌ EARLY EXIT: user is null/undefined after ensureSession`);
      return;
    }
    
    console.log(`${logPrefix}: ✅ user check passed`);
    
    if (!content || !content.trim()) {
      console.error(`${logPrefix}: ❌ EARLY EXIT: content is empty after trim`);
      return;
    }
    
    console.log(`${logPrefix}: ✅ content check passed`);

    // 🔥 BYPASS: Skip the hanging getSession() call after ensureSession() has already validated
    // Since ensureSession() returned true, we trust that the session is usable
    console.log(`${logPrefix}: ✅ Skipping getSession() check - trusting ensureSession() validation`);
    
    console.log(`${logPrefix}: 🔍 All pre-insert checks completed, proceeding to insert`);

    try {
      // Step 1: Prepare message data

      const messageData = {
        user_id: user.id,
        content: content.trim(),
        message_type: messageType,
      };
      console.log(`${logPrefix}: Prepared message data`, messageData)

      // Step 2: Try manual fetch first to bypass Supabase client issues
      console.log(`${logPrefix}: 🔧 Attempting manual fetch insert to bypass client issues`);
      
      let data = null;
      let error = null;
      
      try {
        const manualResult = await manualInsertMessage(messageData);
        console.log(`${logPrefix}: ✅ Manual insert succeeded`, {
          manualResult,
          messageId: manualResult?.id
        });
        
        // Fetch the complete message with user data using Supabase client
        if (manualResult?.id) {
          console.log(`${logPrefix}: Fetching complete message data with user info`);
          const { data: completeMessage, error: fetchError } = await supabase
            .from('messages')
            .select(`
              *,
              user:users!user_id(*)
            `)
            .eq('id', manualResult.id)
            .single();
            
          if (fetchError) {
            console.warn(`${logPrefix}: ⚠️ Failed to fetch complete message, using manual result`, fetchError);
            data = manualResult;
          } else {
            console.log(`${logPrefix}: ✅ Complete message data fetched successfully`);
            data = completeMessage;
          }
        } else {
          data = manualResult;
        }
        
      } catch (manualError) {
        console.warn(`${logPrefix}: ⚠️ Manual insert failed, falling back to Supabase client`, {
          manualError,
          message: manualError instanceof Error ? manualError.message : 'Unknown error'
        });
        
        // Fallback to original Supabase client method
        console.log(`${logPrefix}: 💾 Falling back to Supabase client insert`);
        
      const insertStartTime = performance.now();
      
      const insertResult = await supabase
        .from('messages')
        .insert(messageData)
        .select(`
          *,
          user:users!user_id(*)
        `)
        .single();
      
        const insertData = insertResult.data;
        const insertError = insertResult.error;
        
        console.log(`${logPrefix}: 🧪 Supabase client insert response`, {
          data: insertData,
          error: insertError,
          hasData: !!insertData,
          hasError: !!insertError
        });
      
        const insertEndTime = performance.now();
        const insertDuration = insertEndTime - insertStartTime;
        console.log(`${logPrefix}: 📊 Supabase client insert timing`, { duration: insertDuration });
        
        data = insertData;
        error = insertError;
        
        // Handle auth errors with retry for Supabase client
        if (error && (error.status === 401 || /jwt|token|expired/i.test(error.message))) {
          console.log(`${logPrefix}: 🔄 Auth error detected, attempting session refresh and retry`);
          
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          
          if (!refreshError && refreshData.session) {
            console.log(`${logPrefix}: ✅ Session refreshed, retrying insert`);
            
            const retry = await supabase
              .from('messages')
              .insert(messageData)
              .select(`
                *,
                user:users!user_id(*)
              `)
              .single();
              
            data = retry.data;
            error = retry.error;
            
            console.log(`${logPrefix}: 🔄 Retry result`, {
              hasData: !!data,
              hasError: !!error
            });
          } else {
            console.error(`${logPrefix}: ❌ Session refresh failed, cannot retry`);
          }
        }
      }

      // Final error check
      if (error) {
        console.error(`${logPrefix}: ❌ Final insert error`, {
          error,
          message: error.message,
          code: error.code,
          details: error.details
        });
        throw error;
      }
      
      if (data) {
        console.log(`${logPrefix}: ✅ INSERT SUCCEEDED`, {
          messageId: data.id,
          content: data.content,
          userId: data.user_id,
          timestamp: data.created_at
        });
      } else {
        console.warn(`${logPrefix}: ⚠️ No data returned from insert`);
        throw new Error('No data returned from message insert');
      }

      // Step 3: Update local state and broadcast
      console.log(`${logPrefix}: 📤 Updating local state and broadcasting message`);
      
        setMessages(prev => {
          const exists = prev.find(m => m.id === data.id)
          if (exists) {
            console.log(`${logPrefix}: Message already exists in state, skipping update`);
            return prev;
          }
          const updated = [...prev, data as Message]
          console.log(`${logPrefix}: Message state updated`, {
            totalMessages: updated.length,
            addedMessageId: data.id
          })
          return updated
        })
        
        const broadcastResult = channelRef.current?.send({
          type: 'broadcast',
          event: 'new_message',
          payload: data
        });
        console.log(`${logPrefix}: Broadcast result`, {
          result: broadcastResult,
          channelState: channelRef.current?.state,
        });
      
      console.log(`${logPrefix}: ✅ Message send process completed successfully`);
      
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

    console.log('📝 [EDIT] Editing message:', { messageId, content });

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
        console.error('❌ Error editing message:', error);
        throw error;
      }

      console.log('✅ Message edited successfully');
    } catch (error) {
      console.error('❌ Exception editing message:', error);
      throw error;
    }
  }, [user]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return;

    console.log('🗑️ [DELETE] Deleting message:', { messageId });

    try {
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', user.id);

      if (error) {
        console.error('❌ Error deleting message:', error);
        throw error;
      }

      console.log('✅ Message deleted successfully');
    } catch (error) {
      console.error('❌ Exception deleting message:', error);
      throw error;
    }
  }, [user]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;

    console.log('👍 [REACTION] Toggling reaction:', { messageId, emoji });

    try {
      const { error } = await supabase.rpc('toggle_message_reaction', {
        message_id: messageId,
        emoji: emoji,
        is_dm: false
      });

      if (error) {
        console.error('❌ Error toggling reaction:', error);
        throw error;
      }

      console.log('✅ Reaction toggled successfully');
    } catch (error) {
      console.error('❌ Exception toggling reaction:', error);
      throw error;
    }
  }, [user]);

  const togglePin = useCallback(async (messageId: string) => {
    if (!user) return;

    console.log('📌 [PIN] Toggling pin:', { messageId });

    try {
      // First get the current pinned status
      const { data: message } = await supabase
        .from('messages')
        .select('pinned')
        .eq('id', messageId)
        .single();

      if (!message) {
        console.error('❌ Message not found for pin toggle');
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
        console.error('❌ Error toggling pin:', error);
        throw error;
      }

      console.log('✅ Pin toggled successfully');
    } catch (error) {
      console.error('❌ Exception toggling pin:', error);
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