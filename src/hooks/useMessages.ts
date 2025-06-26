import { useEffect, useState, useCallback } from 'react';
import { supabase, Message } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const { user } = useAuth();

  // Fetch initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      console.log('📥 useMessages: Fetching initial messages...');
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
          console.error('❌ useMessages: Error fetching messages:', error);
        } else {
          console.log('✅ useMessages: Fetched messages:', data?.length || 0);
          setMessages(data || []);
        }
      } catch (error) {
        console.error('❌ useMessages: Exception fetching messages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) {
      console.log('⏭️ useMessages: Skipping real-time setup - no user');
      return;
    }

    if (subscribed) {
      console.log('⏭️ useMessages: Already subscribed to real-time');
      return;
    }

    console.log('🔄 useMessages: Setting up real-time subscription...');
    
    // Use a static channel name to prevent duplicate subscriptions
    const channelName = `messages-${user.id}`;
    
    const channel = supabase
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
          console.log('📨 useMessages: Real-time INSERT received for message:', payload.new.id);
          
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
              console.error('❌ useMessages: Error fetching new message details:', error);
              return;
            }

            if (newMessage) {
              setMessages(prev => {
                // Check if message already exists to avoid duplicates
                const exists = prev.find(msg => msg.id === newMessage.id);
                if (exists) {
                  console.log('⚠️ useMessages: Message already exists, skipping duplicate');
                  return prev;
                }
                
                console.log('✅ useMessages: Adding new message to state');
                // Add new message to the end
                const updated = [...prev, newMessage as Message];
                
                // Force a new array reference to ensure React detects the change
                return updated.slice();
              });
            }
          } catch (error) {
            console.error('❌ useMessages: Exception handling new message:', error);
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
          console.log('📝 useMessages: Real-time UPDATE received for message:', payload.new.id);
          
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
              console.error('❌ useMessages: Error fetching updated message:', error);
              return;
            }

            if (updatedMessage) {
              console.log('✅ useMessages: Updating message in state');
              setMessages(prev =>
                prev.map(msg => msg.id === updatedMessage.id ? updatedMessage as Message : msg)
              );
            }
          } catch (error) {
            console.error('❌ useMessages: Exception handling message update:', error);
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
          console.log('🗑️ useMessages: Real-time DELETE received for message:', payload.old.id);
          setMessages(prev =>
            prev.filter(msg => msg.id !== payload.old.id)
          );
        }
      )
      .subscribe((status, err) => {
        console.log('📡 useMessages: Real-time subscription status:', status);
        if (err) {
          console.error('❌ useMessages: Real-time subscription error:', err);
        }
        if (status === 'SUBSCRIBED') {
          console.log('✅ useMessages: Successfully subscribed to real-time messages');
          setSubscribed(true);
        }
      });

    return () => {
      console.log('🔌 useMessages: Cleaning up real-time subscription');
      setSubscribed(false);
      supabase.removeChannel(channel);
    };
  }, [user, subscribed]);

  const sendMessage = useCallback(async (content: string, messageType: 'text' | 'command' = 'text') => {
    if (!user || !content.trim()) {
      console.log('❌ Cannot send message: missing user or content', { user: !!user, content: content.trim() });
      return;
    }

    console.log('📤 Sending message:', { userId: user.id, content, messageType });
    setSending(true);
    
    try {
      const messageData = {
        user_id: user.id,
        content: content.trim(),
        message_type: messageType,
      };

      console.log('📝 Inserting message data:', messageData);

      const { data, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select(`
          *,
          user:users!user_id(*)
        `)
        .single();

      if (error) {
        console.error('❌ Error inserting message:', error);
        throw error;
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