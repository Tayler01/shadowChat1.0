import { useEffect, useState, useCallback } from 'react';
import { supabase, DMConversation, DMMessage } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useDirectMessages() {
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Fetch conversations
  useEffect(() => {
    if (!user) return;

    const fetchConversations = async () => {
      const { data, error } = await supabase
        .from('dm_conversations')
        .select(`
          *,
          dm_messages(
            id,
            content,
            sender_id,
            created_at,
            sender:users(*)
          )
        `)
        .contains('participants', [user.id])
        .order('last_message_at', { ascending: false });

      if (error) {
        console.error('Error fetching conversations:', error);
      } else {
        // Process conversations to get other user and last message
        const processedConversations = await Promise.all(
          (data || []).map(async (conv) => {
            const otherUserId = conv.participants.find((id: string) => id !== user.id);
            
            const { data: otherUser } = await supabase
              .from('users')
              .select('*')
              .eq('id', otherUserId)
              .single();

            const lastMessage = conv.dm_messages?.[conv.dm_messages.length - 1];
            
            // Count unread messages
            const { count: unreadCount } = await supabase
              .from('dm_messages')
              .select('*', { count: 'exact', head: true })
              .eq('conversation_id', conv.id)
              .neq('sender_id', user.id)
              .is('read_at', null);

            return {
              ...conv,
              other_user: otherUser,
              last_message: lastMessage,
              unread_count: unreadCount || 0,
            };
          })
        );

        setConversations(processedConversations);
      }
      setLoading(false);
    };

    fetchConversations();
  }, [user]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('dm_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
        },
        (payload) => {
          // Update conversations when new message arrives
          setConversations(prev => {
            const convIndex = prev.findIndex(c => c.id === payload.new.conversation_id);
            if (convIndex >= 0) {
              const updated = [...prev];
              updated[convIndex] = {
                ...updated[convIndex],
                last_message_at: payload.new.created_at,
                unread_count: payload.new.sender_id !== user.id 
                  ? (updated[convIndex].unread_count || 0) + 1 
                  : updated[convIndex].unread_count,
              };
              // Move to top
              const [moved] = updated.splice(convIndex, 1);
              updated.unshift(moved);
              return updated;
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const createConversation = useCallback(async (otherUserId: string) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.rpc('create_dm_conversation', {
        other_user_id: otherUserId,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }
  }, [user]);

  return {
    conversations,
    loading,
    createConversation,
  };
}

export function useConversationMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { user } = useAuth();

  // Fetch messages for conversation
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('dm_messages')
        .select(`
          *,
          sender:users(*)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('Error fetching DM messages:', error);
      } else {
        setMessages(data || []);
        
        // Mark messages as read
        if (user) {
          await supabase
            .from('dm_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .neq('sender_id', user.id)
            .is('read_at', null);
        }
      }
      setLoading(false);
    };

    fetchMessages();
  }, [conversationId, user]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`dm_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          // Fetch the complete message with sender data
          const { data } = await supabase
            .from('dm_messages')
            .select(`
              *,
              sender:users(*)
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages(prev => [...prev, data]);
            
            // Mark as read if not sent by current user
            if (user && data.sender_id !== user.id) {
              await supabase
                .from('dm_messages')
                .update({ read_at: new Date().toISOString() })
                .eq('id', data.id);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  const sendMessage = useCallback(async (content: string) => {
    if (!user || !conversationId || !content.trim()) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('dm_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: content.trim(),
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error sending DM:', error);
      throw error;
    } finally {
      setSending(false);
    }
  }, [user, conversationId]);

  return {
    messages,
    loading,
    sending,
    sendMessage,
  };
}