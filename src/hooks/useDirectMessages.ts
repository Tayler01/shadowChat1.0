import { useEffect, useState, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  supabase,
  DMConversation,
  DMMessage,
  getOrCreateDMConversation,
  markDMMessagesRead,
  ensureSession,
} from '../lib/supabase';
import { useAuth } from './useAuth';

export function useDirectMessages() {
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
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
            sender:users!sender_id(*)
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
          sender:users!sender_id(*)
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
        .subscribe();

      return newChannel;
    };

    channel = subscribeToChannel();

    const handleVisibility = () => {
      if (!document.hidden) {
        if (channel) {
          supabase.removeChannel(channel);
          channel = subscribeToChannel();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  const sendMessage = useCallback(async (content: string) => {
    if (!user || !conversationId || !content.trim()) return;

    setSending(true);
    try {
      const hasSession = await ensureSession();
      if (!hasSession) {
        throw new Error('No valid session');
      }
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
          const refreshed = await ensureSession();
          if (refreshed) {
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