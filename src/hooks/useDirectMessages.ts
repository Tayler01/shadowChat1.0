import { useEffect, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  supabase,
  DMConversation,
  DMMessage,
  getOrCreateDMConversation,
  markDMMessagesRead,
  fetchDMConversations,
} from '../lib/supabase';
import { MESSAGE_FETCH_LIMIT } from '../config';
import { useAuth } from './useAuth';

export function useDirectMessages() {
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const { user } = useAuth();

  // Fetch conversations
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const convs = await fetchDMConversations();
      setConversations(convs);
      setLoading(false);
    };

    fetchData();
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
                last_message: {
                  id: payload.new.id,
                  conversation_id: payload.new.conversation_id,
                  sender_id: payload.new.sender_id,
                  content: payload.new.content,
                  read_at: payload.new.read_at,
                  reactions: payload.new.reactions,
                  edited_at: payload.new.edited_at,
                  created_at: payload.new.created_at,
                },
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dm_messages',
        },
        (payload) => {
          setConversations(prev => {
            const convIndex = prev.findIndex(c => c.id === payload.new.conversation_id);
            if (convIndex >= 0 && prev[convIndex].last_message?.id === payload.new.id) {
              const updated = [...prev];
              updated[convIndex] = {
                ...updated[convIndex],
                last_message: {
                  ...updated[convIndex].last_message!,
                  reactions: payload.new.reactions,
                  content: payload.new.content,
                  read_at: payload.new.read_at,
                  edited_at: payload.new.edited_at,
                },
              };
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

  const {
    messages,
    sendMessage,
  } = useConversationMessages(currentConversation);

  const startConversation = useCallback(async (username: string) => {
    if (!user) return null;

    const { data: otherUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      console.error('Error finding user:', error);
      throw error;
    }

    if (!otherUser) {
      throw new Error('User not found');
    }

    const conversation = await getOrCreateDMConversation(otherUser.id);
    if (conversation) {
      setCurrentConversation(conversation.id);
      return conversation.id as string;
    }
    return null;
  }, [user]);

  const markAsRead = useCallback(async (conversationId: string) => {
    await markDMMessagesRead(conversationId);
    setConversations(prev =>
      prev.map(c =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c
      )
    );
  }, []);

  return {
    conversations,
    loading,
    currentConversation,
    setCurrentConversation,
    messages,
    startConversation,
    sendMessage,
    markAsRead,
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
          sender:users!sender_id(*)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(MESSAGE_FETCH_LIMIT);

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

    let channel: RealtimeChannel | null = null;

    const subscribeToChannel = (): RealtimeChannel => {
      const newChannel = supabase
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
                sender:users!sender_id(*)
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
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'dm_messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          async (payload) => {
            const { data } = await supabase
              .from('dm_messages')
              .select(`
                *,
                sender:users!sender_id(*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (data) {
              setMessages(prev =>
                prev.map(m => (m.id === data.id ? data : m))
              );
            }
          }
        )
        .subscribe();

      return newChannel;
    };

    channel = subscribeToChannel();

    const handleVisibility = () => {
      if (!document.hidden) {
        supabase.auth.refreshSession().catch(err => {
          console.error('Error refreshing session on visibility change:', err);
        });
        if (channel && channel.state !== 'joined') {
          supabase.removeChannel(channel);
          channel = subscribeToChannel();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  const sendMessage = useCallback(async (content: string) => {
    if (!user || !conversationId || !content.trim()) return;

    setSending(true);
    try {
      const { data, error } = await supabase
        .from('dm_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: content.trim(),
        })
        .select(`
          *,
          sender:users!sender_id(*)
        `)
        .single();

      let finalData = data;
      let finalError = error;
      if (finalError) {
        if (finalError.status === 401 || /jwt|token|expired/i.test(finalError.message)) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError) {
            const retry = await supabase
              .from('dm_messages')
              .insert({
                conversation_id: conversationId,
                sender_id: user.id,
                content: content.trim(),
              })
              .select(`
                *,
                sender:users!sender_id(*)
              `)
              .single();
            finalData = retry.data;
            finalError = retry.error;
          }
        }
        if (finalError) throw finalError;
      }

      if (finalData) {
        // Optimistically add the sent message
        setMessages(prev => [...prev, finalData as DMMessage]);
      }
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
