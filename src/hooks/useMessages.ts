import { useEffect, useState, useCallback } from 'react';
import { supabase, Message } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { user: authUser } = useAuth();

  // Add debugging for user state
  useEffect(() => {
    console.log('🔍 useMessages - user state changed:', { 
      user: authUser, 
      hasUser: !!authUser,
      userId: authUser?.id 
    });
  }, [authUser]);

  // Fetch initial messages
  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          user:users!user_id(*)
        `)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('Error fetching messages:', error);
      } else {
        setMessages(data || []);
      }
      setLoading(false);
    };

    fetchMessages();
  }, []);

  // Subscribe to real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          // Fetch the complete message with user data
          const { data } = await supabase
            .from('messages')
            .select(`
              *,
              user:users!user_id(*)
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages(prev => [...prev, data]);
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
          // Fetch the updated message with user data
          const { data } = await supabase
            .from('messages')
            .select(`
              *,
              user:users!user_id(*)
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages(prev =>
              prev.map(msg => msg.id === data.id ? data : msg)
            );
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const sendMessage = useCallback(async (content: string, messageType: 'text' | 'command' = 'text') => {
    if (!authUser || !content.trim()) {
      console.log('❌ Cannot send message: missing user or content', { 
        user: !!authUser, 
        userId: authUser?.id,
        content: content.trim() 
      });
      return;
    }

    console.log('📤 Sending message:', { userId: authUser.id, content, messageType });
    setSending(true);
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          user_id: authUser.id,
          content: content.trim(),
          message_type: messageType,
        });

      if (error) {
        console.error('❌ Error inserting message:', error);
        throw error;
      }
      
      console.log('✅ Message sent successfully');
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    } finally {
      setSending(false);
    }
  }, [authUser]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!authUser) return;

    const { error } = await supabase
      .from('messages')
      .update({
        content,
        edited_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('user_id', authUser.id);

    if (error) {
      console.error('Error editing message:', error);
      throw error;
    }
  }, [authUser]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!authUser) return;

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', authUser.id);

    if (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }, [authUser]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!authUser) return;

    try {
      const { error } = await supabase.rpc('toggle_message_reaction', {
        message_id_param: messageId,
        emoji_param: emoji
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error toggling reaction:', error);
      throw error;
    }
  }, [authUser]);

  const pinMessage = useCallback(async (messageId: string) => {
    if (!authUser) return;

    const { error } = await supabase
      .from('messages')
      .update({
        pinned: true,
        pinned_by: authUser.id,
        pinned_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    if (error) {
      console.error('Error pinning message:', error);
      throw error;
    }
  }, [authUser]);

  const togglePin = useCallback(async (messageId: string) => {
    if (!authUser) return;

    // First get the current pinned status
    const { data: message } = await supabase
      .from('messages')
      .select('pinned')
      .eq('id', messageId);

    if (!message || message.length === 0) return;

    const isPinned = message[0].pinned;
    
    const { error } = await supabase
      .from('messages')
      .update({
        pinned: !isPinned,
        pinned_by: !isPinned ? authUser.id : null,
        pinned_at: !isPinned ? new Date().toISOString() : null,
      })
      .eq('id', messageId);

    if (error) {
      console.error('Error toggling pin:', error);
      throw error;
    }
  }, [authUser]);

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