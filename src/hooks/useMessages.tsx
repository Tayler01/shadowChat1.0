import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef
} from 'react';
import { Message, ensureSession, refreshSessionLocked, getWorkingClient, recreateSupabaseClient, supabase, resetRealtimeConnection } from '../lib/supabase';
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
  const workingClient = await getWorkingClient();
  const insertPromise = workingClient
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

    const duration = performance.now() - start;
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
  const refreshPromise = refreshSessionLocked();
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
  const clientResetRef = useRef<() => Promise<void>>();

  const fetchMessages = useCallback(async () => {
    try {
      const workingClient = await getWorkingClient();
      const [pinnedRes, messagesRes] = await Promise.all([
        workingClient
          .from('messages')
          .select(
            `
          *,
          user:users!user_id(*)
        `,
          )
          .eq('pinned', true)
          .order('pinned_at', { ascending: true }),
        workingClient
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
    } catch {
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset function to reinitialize everything with fresh client
  const resetWithFreshClient = useCallback(async () => {
    }
    
    try {
      // Clean up old channel
      if (channelRef.current) {
        try {
          const workingClient = await getWorkingClient()
          if (workingClient && workingClient.removeChannel && typeof workingClient.removeChannel === 'function') {
            await workingClient.removeChannel(channelRef.current)
          }
        } catch {
        }
        channelRef.current = null
      }
      
      // Refetch messages with new client
      await fetchMessages()
      
      // Resubscribe to realtime with new client
      if (subscribeRef.current) {
        try {
          const newChannel = await subscribeRef.current()
          channelRef.current = newChannel
        } catch (subscribeError) {
        }
      }
      
    } catch {
    }
  }, []);

  const handleVisible = useCallback(() => {
    const channel = channelRef.current;
    if (channel && channel.state !== 'joined') {
      }
      // Channel cleanup will be handled by the useEffect cleanup
      if (subscribeRef.current) {
        subscribeRef.current().then(newChannel => {
          if (newChannel) {
            channelRef.current = newChannel
          }
        }).catch(error => {
        })
      }
    }
    
    // Use the reset function instead of just fetchMessages
    if (clientResetRef.current) {
      clientResetRef.current()
    } else {
      fetchMessages()
    }
  }, [fetchMessages])

  useVisibilityRefresh(handleVisible)

  // Fetch initial messages
  useEffect(() => {
    fetchMessages();
    
    // Store the reset function for visibility refresh
    clientResetRef.current = resetWithFreshClient;
    
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
    let currentClient: any = null;

    const subscribeToChannel = async (): Promise<RealtimeChannel> => {
      currentClient = await getWorkingClient();
      
      if (!currentClient) {
        throw new Error('No working Supabase client available')
      }
      
      if (!currentClient.channel || typeof currentClient.channel !== 'function') {
        throw new Error('Supabase client does not support realtime channels')
      }
      
      const newChannel = currentClient
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
          table: 'messages'
        },
        async (payload) => {
          
          try {
            // Fetch the complete message with user data
            const workingClient = await getWorkingClient();
            const { data: newMessage, error } = await workingClient
              .from('messages')
              .select(`
                *,
                user:users!user_id(*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (error) {
              }
              return;
            }

            if (newMessage) {
              // Log received message with clear indication if it's from another user
              const isFromCurrentUser = newMessage.user_id === user.id;
              const logPrefix = isFromCurrentUser ? '📨 [REALTIME-SELF]' : '📨 [REALTIME-OTHER]';
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
          } catch {
            }
          }
        }
      )
      .on('broadcast', { event: 'new_message' }, (payload) => {
        const newMessage = payload.payload as Message
        
        // Log broadcast message with clear indication if it's from another user
        const isFromCurrentUser = newMessage.user_id === user.id;
        const logPrefix = isFromCurrentUser ? '📡 [BROADCAST-SELF]' : '📡 [BROADCAST-OTHER]';
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
          table: 'messages'
        },
        async (payload) => {
          
          try {
            // Fetch the updated message with user data
            const workingClient = await getWorkingClient();
            const { data: updatedMessage, error } = await workingClient
              .from('messages')
              .select(`
                *,
                user:users!user_id(*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (error) {
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
          } catch {
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages'
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
          
          // Handle specific binding mismatch error
          if (err.message && err.message.includes('mismatch between server and client bindings for postgres changes')) {
            }
            try {
              // Use resetRealtimeConnection to clear server-side bindings
              await resetRealtimeConnection();
              
              // Use the comprehensive reset function
              if (clientResetRef.current) {
                await clientResetRef.current();
              }
            } catch (resetError) {
              // Fallback to simple resubscription after delay
              setTimeout(() => {
                subscribeToChannel().then(newCh => {
                  channel = newCh;
                  channelRef.current = newCh;
                });
              }, 2000);
            }
            return;
          }
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          }
          try {
            // Use resetRealtimeConnection to clear server-side bindings
            await resetRealtimeConnection();
            
            // Use the comprehensive reset function
            if (clientResetRef.current) {
              await clientResetRef.current();
            }
          } catch (resetError) {
            // Fallback to simple resubscription after delay
            setTimeout(() => {
              subscribeToChannel().then(newCh => {
                channel = newCh;
                channelRef.current = newCh;
              });
            }, 2000);
          }
        } else if (status === 'CLOSED') {
          }
          setTimeout(() => {
            subscribeToChannel().then(newCh => {
              channel = newCh;
              channelRef.current = newCh;
            });
          }, 1000);
        }
      });

      return newChannel;
    };

    subscribeToChannel().then(newChannel => {
      channel = newChannel;
      channelRef.current = newChannel;
    });
    subscribeRef.current = subscribeToChannel;

    return () => {
      if (channel && currentClient && currentClient.removeChannel && typeof currentClient.removeChannel === 'function') {
        currentClient.removeChannel(channel);
      }
      channelRef.current = null
    };
  }, [user, fetchMessages]);

  const sendMessage = useCallback(async (
    content: string,
    messageType: 'text' | 'command' | 'audio' | 'image' = 'text',
    fileUrl?: string
  ) => {
    const timestamp = new Date().toISOString();
    const logPrefix = `🚀 [MESSAGES] [${timestamp}] sendMessage`;

    }

    // Text messages require content, but image/audio messages may provide just a file URL
    if (!user || (!content.trim() && !fileUrl)) {
      return;
    }

    setSending(true);
    }

    // Ensure we have a valid session before attempting database operations
    const sessionValid = await ensureSession();
    }
    if (!sessionValid) {
      throw new Error('Authentication session is invalid or expired. Please refresh the page and try again.');
    }

    // Log current session tokens and user details for debugging
    try {
      const workingClient = await getWorkingClient();
      const { data: { session } } = await workingClient.auth.getSession();
      }
    } catch (tokenErr) {
    }

    try {
      // Step 1: Prepare message data
      const messageData = prepareMessageData(user.id, content, messageType, fileUrl);
      }

      // Step 2: Attempt database insert (let Supabase handle auth internally)
      let { data, error } = await insertMessage(messageData);

      // Step 3: Handle auth errors with retry
      if (error && (error.status === 401 || /jwt|token|expired/i.test(error.message))) {
        const retry = await refreshSessionAndRetry(messageData);
        }
        data = retry.data;
        error = retry.error;
      }

      if (error) {
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
        }

        // Ensure we didn't miss any messages due to timing issues
        fetchMessages()
      }
      
      
    } catch {
      throw error;
    } finally {
      setSending(false);
    }
  }, [user]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!user) return;


    try {
      const workingClient = await getWorkingClient();
      
      const { error } = await workingClient
        .from('messages')
        .update({
          content,
          edited_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .eq('user_id', user.id);

      if (error) {
        }
        throw error;
      }


      // Optimistically update local state
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, content, edited_at: new Date().toISOString() } as Message : m
        )
      );
      

    } catch {
      }
      throw error;
    }
  }, [user]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return;


    try {
      const workingClient = await getWorkingClient();
      
      const { error } = await workingClient
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('user_id', user.id);

      if (error) {
        }
        throw error;
      }


      // Optimistically remove from local state
      setMessages(prev => prev.filter(m => m.id !== messageId));
      

    } catch {
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
      const workingClient = await getWorkingClient();
      
      const { error } = await workingClient.rpc('toggle_message_reaction', {
        message_id: messageId,
        emoji: emoji,
        is_dm: false,
      });

      if (error) {
        }
        throw error;
      }
      
    } catch {
      }
      throw error;
    }
  }, [user]);

  const togglePin = useCallback(async (messageId: string) => {
    if (!user) return;


    const current = messages.find(m => m.id === messageId);
    const isPinned = current?.pinned;

    try {
      const workingClient = await getWorkingClient();
      
      const { error } = await workingClient.rpc('toggle_message_pin', {
        message_id: messageId,
      });

      if (error) {
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
      
    } catch {
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
