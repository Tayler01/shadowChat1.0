import { useEffect, useState, useCallback } from 'react';
import { supabase, Message } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useMessages() {
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
        } else {
          console.log('✅ Fetched messages:', data?.length || 0);
          setMessages(data || []);
        }
      } catch (error) {
        console.error('❌ Exception fetching messages:', error);
      } finally {
        setLoading(false);
      }
    };

    // Only fetch if we have a user
    if (user) {
      fetchMessages();
    } else {
      setLoading(false);
    }
  }, [user]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) {
      console.log('⏭️ Skipping real-time setup - no user');
      return;
    }

    console.log('🔄 Setting up real-time subscription for messages...');
    
    const channel = supabase
      .channel('public:messages', {
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
          console.log('📨 New message received via real-time:', payload.new);
          
          try {
            // Fetch the complete message with user data
            const { data, error } = await supabase
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

            if (data) {
              console.log('✅ Adding new message to state:', data);
              setMessages(prev => {
                // Check if message already exists to avoid duplicates
                const exists = prev.find(msg => msg.id === data.id);
                if (exists) {
                  console.log('⚠️ Message already exists, skipping');
                  return prev;
                }
                return [...prev, data];
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
          console.log('📝 Message updated via real-time:', payload.new);
          
          try {
            // Fetch the updated message with user data
            const { data, error } = await supabase
              .from('messages')
              .select(`
                *,
                user:users!user_id(*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (error) {
              console.error('❌ Error fetching updated message details:', error);
              return;
            }

            if (data) {
              console.log('✅ Updating message in state:', data);
              setMessages(prev =>
                prev.map(msg => msg.id === data.id ? data : msg)
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
          console.log('🗑️ Message deleted via real-time:', payload.old);
          setMessages(prev =>
            prev.filter(msg => msg.id !== payload.old.id)
          );
        }
      )
      .subscribe((status) => {
        console.log('📡 Real-time subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to real-time messages');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error');
        }
      });

    return () => {
      console.log('🔌 Cleaning up real-time subscription');
      supabase.removeChannel(channel);
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
      const { data, error } = await supabase
        .from('messages')
        .insert({
          user_id: user.id,
          content: content.trim(),
          message_type: messageType,
        })
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
      
      // Optimistically add the message to avoid waiting for real-time
      if (data) {
        setMessages(prev => {
          const exists = prev.find(msg => msg.id === data.id);
          if (exists) return prev;
          return [...prev, data];
        });
      }
    } catch (error) {
      console.error('❌ Exception sending message:', error);
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
        console.error('Error editing message:', error);
        throw error;
      }
    } catch (error) {
      console.error('Exception editing message:', error);
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
        console.error('Error deleting message:', error);
        throw error;
      }
    } catch (error) {
      console.error('Exception deleting message:', error);
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
        console.error('Error toggling reaction:', error);
        throw error;
      }
    } catch (error) {
      console.error('Exception toggling reaction:', error);
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

      if (!message) return;

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
        console.error('Error toggling pin:', error);
        throw error;
      }
    } catch (error) {
      console.error('Exception toggling pin:', error);
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