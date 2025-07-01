import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef
} from 'react';
import { supabase, Message, ensureSession, DEBUG } from '../lib/supabase';
import { MESSAGE_FETCH_LIMIT } from '../config';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from './useAuth';
import { useVisibilityRefresh } from './useVisibilityRefresh';

const STORED_MESSAGE_LIMIT = 200;

// --- Helper functions extracted from sendMessage workflow ---
export const prepareMessageData = (
  userId: string,
  content: string,
  messageType: 'text' | 'command' | 'audio' | 'image',
  fileUrl?: string
) => ({
  user_id: userId,
  content: messageType === 'audio' ? '' : content.trim(),
  message_type: messageType,
  file_url: fileUrl,
  ...(messageType === 'audio' ? { audio_url: content.trim() } : {}),
});

export const insertMessage = async (messageData: {
  user_id: string;
  content: string;
  message_type: 'text' | 'command' | 'audio' | 'image';
  file_url?: string;
  audio_url?: string;
}) => {
  const start = performance.now();
  const insertPromise = supabase
    .from('messages')
    .insert(messageData)
    .select(`
      *,
      user:users!user_id(*)
    `)
    .single();

  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('Database insert timeout after 10 seconds')),
      10000
    )
  );

  const result = (await Promise.race([insertPromise, timeout])) as any;

  if (DEBUG) {
    const duration = performance.now() - start;
    console.log('[insertMessage] result', { duration, ...result });
  }

  return result as { data: Message | null; error: any };
};

export const refreshSessionAndRetry = async (messageData: {
  user_id: string;
  content: string;
  message_type: 'text' | 'command' | 'audio' | 'image';
  file_url?: string;
  audio_url?: string;
}) => {
  const refreshPromise = supabase.auth.refreshSession();
  const refreshTimeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('Session refresh timeout after 5 seconds')),
      5000
    )
  );

  const { data: refreshData, error: refreshError } = (await Promise.race([
    refreshPromise,
    refreshTimeout,
  ])) as any;

  if (DEBUG) {
    console.log('[refreshSessionAndRetry] refresh result', {
      refreshData,
      refreshError,
    });
  }

  if (!refreshError && refreshData.session) {
    return insertMessage(messageData);
  }

  return { data: null, error: refreshError } as {
    data: Message | null;
    error: any;
  };
};

interface MessagesContextValue {
  messages: Message[];
  loading: boolean;
  sending: boolean;
  sendMessage: (
    content: string,
    type?: 'text' | 'command' | 'audio' | 'image',
    fileUrl?: string
  ) => Promise<void>;
  editMessage: (id: string, content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  toggleReaction: (id: string, emoji: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
}

const MessagesContext = createContext<MessagesContextValue | undefined>(undefined);

function useProvideMessages(): MessagesContextValue {
  const initialMessages = (() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('chatHistory');
        if (stored) {
          return (JSON.parse(stored) as Message[]).slice(-STORED_MESSAGE_LIMIT);
        }
      } catch {
        // ignore parse errors
      }
    }
    return [] as Message[];
  })();

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [loading, setLoading] = useState(initialMessages.length === 0);
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribeRef = useRef<() => RealtimeChannel>();

  const fetchMessages = useCallback(async () => {
    try {
      const [pinnedRes, messagesRes] = await Promise.all([
        supabase
          .from('messages')
          .select(
            `
          *,
          user:users!user_id(*)
        `,
          )
          .eq('pinned', true)
          .order('pinned_at', { ascending: true }),
        supabase
          .from('messages')
          .select(
            `
          *,
          user:users!user_id(*)
        `,
          )
          .order('created_at', { ascending: true })
          .limit(MESSAGE_FETCH_LIMIT),
      ]);

      const data = [...(pinnedRes.data || []), ...(messagesRes.data || [])];
      const error = pinnedRes.error || messagesRes.error;

      if (error) {
        if (DEBUG) {
          console.error('❌ Error fetching messages:', error)
        }
      } else if (data.length > 0) {
        setMessages(prev => {
          if (prev.length === 0) {
            if (typeof localStorage !== 'undefined') {
              try {
              localStorage.setItem(
                'chatHistory',
                JSON.stringify(data.slice(-STORED_MESSAGE_LIMIT))
              );
              } catch {}
            }
            return data as Message[];
          }
          const ids = new Set(prev.map(m => m.id));
          const merged = [...prev, ...data.filter(m => !ids.has(m.id))];
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem(
                'chatHistory',
                JSON.stringify(merged.slice(-STORED_MESSAGE_LIMIT))
              );
            } catch {}
          }
          return merged;
        });
      }
    } catch (error) {
      if (DEBUG) {
        console.error('❌ Exception fetching messages:', error)
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleVisible = useCallback(() => {
    const channel = channelRef.current;
    if (channel && channel.state !== 'joined') {
      if (DEBUG) {
        console.log('🌀 Resubscribing channel due to state', channel.state)
      }
      supabase.removeChannel(channel)
      const newChannel = subscribeRef.current?.()
      if (newChannel) {
        channelRef.current = newChannel
      }
    }
    fetchMessages()
  }, [fetchMessages])

  useVisibilityRefresh(handleVisible)

  // Fetch initial messages
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          'chatHistory',
          JSON.stringify(messages.slice(-STORED_MESSAGE_LIMIT))
        );
      } catch {
        // ignore storage errors
      }
    }
  }, [messages]);

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
              if (DEBUG) {
                console.error('❌ Error fetching new message details:', error)
              }
              return;
            }

            if (newMessage) {
              // Log received message with clear indication if it's from another user
              const isFromCurrentUser = newMessage.user_id === user.id;
              const logPrefix = isFromCurrentUser ? '📨 [REALTIME-SELF]' : '📨 [REALTIME-OTHER]';
              if (DEBUG) {
                console.log(`${logPrefix} Message received:`, {
                  id: newMessage.id,
                  content: newMessage.content,
                  from: newMessage.user?.display_name || 'Unknown',
                  userId: newMessage.user_id,
                  isFromMe: isFromCurrentUser,
                  timestamp: newMessage.created_at
                });
              }

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
            if (DEBUG) {
              console.error('❌ Exception handling new message:', error)
            }
          }
        }
      )
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const newMessage = payload.payload as Message
        
        // Log broadcast message with clear indication if it's from another user
        const isFromCurrentUser = newMessage.user_id === user.id;
        const logPrefix = isFromCurrentUser ? '📡 [BROADCAST-SELF]' : '📡 [BROADCAST-OTHER]';
        if (DEBUG) {
          console.log(`${logPrefix} Broadcast message received:`, {
            id: newMessage.id,
            content: newMessage.content,
            from: newMessage.user?.display_name || 'Unknown',
            userId: newMessage.user_id,
            isFromMe: isFromCurrentUser,
            timestamp: newMessage.created_at
          });
        }
        
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
              if (DEBUG) {
                console.error('❌ Error fetching updated message:', error)
              }
              return;
            }

            if (updatedMessage) {
              setMessages(prev => {
                const index = prev.findIndex(msg => msg.id === updatedMessage.id)
                if (index !== -1) {
                  return prev.map(msg =>
                    msg.id === updatedMessage.id ? (updatedMessage as Message) : msg
                  )
                }
                return [...prev, updatedMessage as Message]
              })
            }
          } catch (error) {
            if (DEBUG) {
              console.error('❌ Exception handling message update:', error)
            }
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
          if (DEBUG) {
            console.error('❌ Real-time subscription error:', err)
          }
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (DEBUG) {
            console.warn(`⚠️ Channel ${status}, removing and resubscribing...`)
          }
          await supabase.removeChannel(newChannel);
          setTimeout(() => {
            channel = subscribeToChannel();
          }, 1000);
        } else if (status === 'CLOSED') {
          if (DEBUG) {
            console.warn('⚠️ Channel closed, resubscribing...')
          }
          setTimeout(() => {
            channel = subscribeToChannel();
          }, 1000);
        }
      });

      return newChannel;
    };

    channel = subscribeToChannel();
    subscribeRef.current = subscribeToChannel;
    channelRef.current = channel;

    return () => {
      if (channel) supabase.removeChannel(channel)
      channelRef.current = null
    };
  }, [user, fetchMessages]);

  const sendMessage = useCallback(async (
    content: string,
    messageType: 'text' | 'command' | 'audio' | 'image' = 'text',
    fileUrl?: string
  ) => {
    const timestamp = new Date().toISOString();
    const logPrefix = `🚀 [${timestamp}] MESSAGE_SEND`;

    if (DEBUG) {
      console.log(`${logPrefix}: Called`, {
        hasUser: !!user,
        userId: user?.id,
        content
      });
    }

    // Text messages require content, but image/audio messages may provide just a file URL
    if (!user || (!content.trim() && !fileUrl)) {
      console.warn(`${logPrefix}: Skipped send — missing user or empty content`, { hasUser: !!user, content, userId: user?.id, hasFileUrl: !!fileUrl });
      return;
    }

    setSending(true);
    if (DEBUG) {
      console.log(`${logPrefix}: Channel state before send`, {
        hasChannel: !!channelRef.current,
        state: channelRef.current?.state,
      })
    }

    // Ensure we have a valid session before attempting database operations
    const sessionValid = await ensureSession();
    if (DEBUG) {
      console.log(`${logPrefix}: After ensureSession`, {
        sessionValid,
        hasUser: !!user,
        userId: user?.id,
      });
    }
    if (!sessionValid) {
      console.error(`${logPrefix}: ❌ Invalid or expired session, cannot send message`);
      throw new Error('Authentication session is invalid or expired. Please refresh the page and try again.');
    }

    // Log current session tokens and user details for debugging
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (DEBUG) {
        console.log(`${logPrefix}: Session details`, {
          access_token: session?.access_token,
          refresh_token: session?.refresh_token,
          userId: session?.user?.id,
        });
      }
    } catch (tokenErr) {
      console.error(`${logPrefix}: Failed to get session tokens`, tokenErr);
    }

    try {
      // Step 1: Prepare message data
      const messageData = prepareMessageData(user.id, content, messageType, fileUrl);
      if (DEBUG) {
        console.log(`${logPrefix}: Prepared message data`, messageData);
      }

      // Step 2: Attempt database insert (let Supabase handle auth internally)
      let { data, error } = await insertMessage(messageData);

      // Step 3: Handle auth errors with retry
      if (error && (error.status === 401 || /jwt|token|expired/i.test(error.message))) {
        const retry = await refreshSessionAndRetry(messageData);
        if (DEBUG) {
          console.log(`${logPrefix}: Retry result`, retry);
        }
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        console.error(`${logPrefix}: ❌ Final error after retry:`, error);
        throw error;
      }

      // Message successfully inserted

      // Step 4: Update local state and broadcast
      if (data) {
        setMessages(prev => {
          const exists = prev.find(m => m.id === data.id)
          if (exists) {
            return prev;
          }
          const updated = [...prev, data as Message]
          if (DEBUG) {
            console.log(`${logPrefix}: Message state updated`, {
              totalMessages: updated.length,
            })
          }
          return updated
        })
        
        let broadcastResult: unknown = null
        if (channelRef.current?.state === 'joined') {
          broadcastResult = channelRef.current.send({
            type: 'broadcast',
            event: 'new_message',
            payload: data,
          })
        }
        if (DEBUG) {
          console.log(`${logPrefix}: Broadcast result`, {
            result: broadcastResult,
            channelState: channelRef.current?.state,
          })
        }

        // Ensure we didn't miss any messages due to timing issues
        fetchMessages()
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
        if (DEBUG) {
          console.error('❌ Error editing message:', error)
        }
        throw error;
      }

      // Optimistically update local state
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, content, edited_at: new Date().toISOString() } as Message : m
        )
      );

    } catch (error) {
      if (DEBUG) {
        console.error('❌ Exception editing message:', error)
      }
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
        if (DEBUG) {
          console.error('❌ Error deleting message:', error)
        }
        throw error;
      }

      // Optimistically remove from local state
      setMessages(prev => prev.filter(m => m.id !== messageId));

    } catch (error) {
      if (DEBUG) {
        console.error('❌ Exception deleting message:', error)
      }
      throw error;
    }
  }, [user]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;

    // Optimistically update local state so the reaction appears immediately
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === messageId);
      if (idx === -1) return prev;

      const message = prev[idx];
      const reactions = { ...(message.reactions || {}) } as Record<string, { count: number; users: string[] }>;
      let data = reactions[emoji] || { count: 0, users: [] as string[] };
      const reacted = data.users.includes(user.id);

      if (reacted) {
        data = {
          count: data.count - 1,
          users: data.users.filter(u => u !== user.id),
        };
        if (data.count <= 0) {
          delete reactions[emoji];
        } else {
          reactions[emoji] = data;
        }
      } else {
        data = {
          count: data.count + 1,
          users: [...data.users, user.id],
        };
        reactions[emoji] = data;
      }

      const updated = { ...message, reactions };
      const newMessages = [...prev];
      newMessages[idx] = updated as Message;
      return newMessages;
    });

    try {
      const { error } = await supabase.rpc('toggle_message_reaction', {
        message_id: messageId,
        emoji: emoji,
        is_dm: false,
      });

      if (error) {
        if (DEBUG) {
          console.error('❌ Error toggling reaction:', error)
        }
        throw error;
      }
    } catch (error) {
      if (DEBUG) {
        console.error('❌ Exception toggling reaction:', error)
      }
      throw error;
    }
  }, [user]);

  const togglePin = useCallback(async (messageId: string) => {
    if (!user) return;

    const current = messages.find(m => m.id === messageId);
    const isPinned = current?.pinned;

    try {
      const { error } = await supabase.rpc('toggle_message_pin', {
        message_id: messageId,
      });

      if (error) {
        if (DEBUG) {
          console.error('❌ Error toggling pin:', error)
        }
        throw error;
      }

      setMessages(prev =>
        prev.map(m => {
          if (m.id === messageId) {
            return {
              ...m,
              pinned: !isPinned,
              pinned_by: !isPinned ? user.id : null,
              pinned_at: !isPinned ? new Date().toISOString() : null,
            };
          }
          return !isPinned
            ? { ...m, pinned: false, pinned_by: null, pinned_at: null }
            : m;
        })
      );
    } catch (error) {
      if (DEBUG) {
        console.error('❌ Exception toggling pin:', error)
      }
      // Re-sync with database to revert optimistic updates
      fetchMessages();
      throw error;
    }
  }, [user, messages]);

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
