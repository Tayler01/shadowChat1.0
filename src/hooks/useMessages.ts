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
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          user:user_id(*)
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
              user:user_id(*)
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
              user:user_id(*)
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
    if (!user || !content.trim()) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          user_id: user.id,
          content: content.trim(),
          message_type: messageType,
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    } finally {
      setSending(false);
    }
  }, [user]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!user) return;

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
  }, [user]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }, [user]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;

    try {
      const { error } = await supabase.rpc('toggle_message_reaction', {
        message_id_param: messageId,
        emoji_param: emoji,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error toggling reaction:', error);
      throw error;
    }
  }, [user]);

  const pinMessage = useCallback(async (messageId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('messages')
      .update({
        pinned: true,
        pinned_by: user.id,
        pinned_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    if (error) {
      console.error('Error pinning message:', error);
      throw error;
    }
  }, [user]);

  const unpinMessage = useCallback(async (messageId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('messages')
      .update({
        pinned: false,
        pinned_by: null,
        pinned_at: null,
      })
      .eq('id', messageId);

    if (error) {
      console.error('Error unpinning message:', error);
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
    pinMessage,
    unpinMessage,
  };
}