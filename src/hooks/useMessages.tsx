import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback
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

  // Fetch initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      console.log('📥 Fetching initial messages...');
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
          console.error('❌ Error fetching messages:', error);
        } else if (data) {
          console.log('✅ Fetched messages:', data.length);
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
        console.error('❌ Exception fetching messages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) {
      console.log('⏭️ Skipping real-time setup - no user');
      return;
    }

    console.log('🔄 Setting up real-time subscription for messages...');

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
          console.log('📨 Real-time INSERT received:', payload);
          
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
              console.error('❌ Error fetching new message details:', error);
              return;
            }

            if (newMessage) {
              console.log('✅ Adding new message to state:', newMessage);
              setMessages(prev => {
                // Check if message already exists to avoid duplicates
                const exists = prev.find(msg => msg.id === newMessage.id);
                if (exists) {
                  console.log('⚠️ Message already exists, skipping duplicate');
                  return prev;
                }
                
                // Add new message to the end
                const updated = [...prev, newMessage as Message];
                console.log('📋 Updated messages count:', updated.length, 'Last message:', updated[updated.length - 1]?.content);
                
                // Force a new array reference to ensure React detects the change
                return updated.slice();
              });
            }
          } catch (error) {
            console.error('❌ Exception handling new message:', error);
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
          console.log('📝 Real-time UPDATE received:', payload);
          
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
              console.error('❌ Error fetching updated message:', error);
              return;
            }

            if (updatedMessage) {
              console.log('✅ Updating message in state:', updatedMessage);
              setMessages(prev =>
                prev.map(msg => msg.id === updatedMessage.id ? updatedMessage as Message : msg)
              );
            }
          } catch (error) {
            console.error('❌ Exception handling message update:', error);
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
          console.log('🗑️ Real-time DELETE received:', payload);
          setMessages(prev =>
            prev.filter(msg => msg.id !== payload.old.id)
          );
        }
      )
      .subscribe(async (status, err) => {
        console.log('📡 Real-time subscription status:', status);
        if (err) {
          console.error('❌ Real-time subscription error:', err);
        }
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to real-time messages');
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`⚠️ Channel ${status}, removing and resubscribing...`);
          await supabase.removeChannel(newChannel);
          setTimeout(() => {
            channel = subscribeToChannel();
          }, 1000);
        } else if (status === 'CLOSED') {
          console.warn('⚠️ Channel closed, resubscribing...');
          setTimeout(() => {
            channel = subscribeToChannel();
          }, 1000);
        }
      });

      return newChannel;
    };

    channel = subscribeToChannel();

    const handleVisibility = () => {
      if (!document.hidden) {
        supabase.auth.refreshSession().catch(err => {
          console.error('Error refreshing session on visibility change:', err)
        })
        if (channel && channel.state !== 'joined') {
          supabase.removeChannel(channel)
          channel = subscribeToChannel()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      console.log('🔌 Cleaning up real-time subscription');
      document.removeEventListener('visibilitychange', handleVisibility)
      if (channel) supabase.removeChannel(channel);
    };
  }, [user]);

  const sendMessage = useCallback(async (content: string, messageType: 'text' | 'command' = 'text') => {
    if (!user || !content.trim()) {
      console.log('❌ Cannot send message: missing user or content', { user: !!user, content: content.trim() });
      return;
    }

    console.log('📤 Sending message:', { userId: user.id, content, messageType });
    setSending(true);

    try {
      const hasSession = await ensureSession();
      if (!hasSession) {
        throw new Error('No valid session');
      }
      const messageData = {
        user_id: user.id,
        content: content.trim(),
        message_type: messageType,
      };

      console.log('📝 Inserting message data:', messageData);
      let { data, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select(`
          *,
          user:users!user_id(*)
        `)
        .single();

      if (error) {
        console.error('❌ Error inserting message:', error);
        if (error.status === 401 || /jwt|token|expired/i.test(error.message)) {
          const refreshed = await ensureSession();
          if (refreshed) {
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
          }
        }
        if (error) throw error;
      }

      console.log('✅ Message sent successfully:', data);

      // Note: We rely on real-time subscription to add the message to state
      // This ensures proper ordering and prevents duplicates
      
    } catch (error) {
      console.error('❌ Exception sending message:', error);
      throw error;
    } finally {
      setSending(false);
    }
  }, [user]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!user) return;

    console.log('📝 Editing message:', { messageId, content });

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

    console.log('🗑️ Deleting message:', messageId);

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

    console.log('👍 Toggling reaction:', { messageId, emoji });

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

    console.log('📌 Toggling pin:', messageId);

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