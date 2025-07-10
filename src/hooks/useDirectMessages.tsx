import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  createContext,
  useContext,
} from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  supabase,
  getWorkingClient,
  DMConversation,
  DMMessage,
  getOrCreateDMConversation,
  markDMMessagesRead,
  fetchDMConversations,
  refreshSessionLocked,
} from '../lib/supabase';
import { MESSAGE_FETCH_LIMIT } from '../config';
import { useAuth } from './useAuth';
import { useVisibilityRefresh } from './useVisibilityRefresh';

interface DirectMessagesContextValue {
  conversations: DMConversation[];
  loading: boolean;
  currentConversation: string | null;
  setCurrentConversation: React.Dispatch<React.SetStateAction<string | null>>;
  messages: DMMessage[];
  loadingMore: boolean;
  hasMore: boolean;
  startConversation: (username: string) => Promise<string | null>;
  sendMessage: (
    content: string,
    messageType?: 'text' | 'command' | 'audio' | 'image' | 'file',
    fileUrl?: string
  ) => Promise<DMMessage | null>;
  markAsRead: (conversationId: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
}

const DirectMessagesContext = createContext<DirectMessagesContextValue | undefined>(undefined);

function useProvideDirectMessages(): DirectMessagesContextValue {
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const { user } = useAuth();

  // Reset function for page refocus
  const resetWithFreshClient = useCallback(async () => {
    try {
      // Refetch conversations with new client
      const convs = await fetchDMConversations();
      setConversations(convs);
      
    } catch {
    }
  }, []);

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
    loadingMore,
    hasMore,
    loadOlderMessages,
  } = useConversationMessages(currentConversation);

  const startConversation = useCallback(async (username: string) => {
    if (!user) return null;

    const workingClient = await getWorkingClient();
    const { data: otherUser, error } = await workingClient
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!otherUser) {
      throw new Error('User not found');
    }

    const conversation = await getOrCreateDMConversation(otherUser.id);
    if (conversation) {
      const convs = await fetchDMConversations();
      setConversations(convs);
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
    loadingMore,
    hasMore,
    startConversation,
    sendMessage,
    markAsRead,
    loadOlderMessages,
  };
}

export function useConversationMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const { user } = useAuth();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribeRef = useRef<() => RealtimeChannel>();
  const clientResetRef = useRef<() => Promise<void>>();

  const handleVisible = useCallback(() => {
    const channel = channelRef.current;
    if (channel && channel.state !== 'joined') {
      supabase.removeChannel(channel);
      const newChannel = subscribeRef.current?.();
      if (newChannel) {
        channelRef.current = newChannel;
      }
    }
    
    // Use reset function if available
    if (clientResetRef.current) {
      clientResetRef.current();
    } else {
    }
  }, []);

  useVisibilityRefresh(handleVisible);

  // Fetch messages for conversation
  useEffect(() => {
    const resetWithFreshClient = async () => {
      if (!conversationId) return;
      
      try {
        // Clean up old channel
        if (channelRef.current) {
          // Channel cleanup will be handled by the useEffect cleanup
          channelRef.current = null;
        }
        
        // Refetch messages and resubscribe
        // This will be handled by the existing useEffect logic
        
      } catch {
      }
    };
    
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const fetchMessages = async () => {
      const workingClient = await getWorkingClient();
      const { data, error } = await workingClient
        .from('dm_messages')
        .select(
          `
          *,
          sender:users!sender_id(*)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_FETCH_LIMIT);

      if (error) {
      } else {
        setHasMore((data?.length || 0) === MESSAGE_FETCH_LIMIT);
        setMessages((data || []).reverse());
        
        // Mark messages as read
        if (user) {
          await workingClient
            .from('dm_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .neq('sender_id', user.id)
            .is('read_at', null);
        }
      }
      setLoading(false);
    };

    // Store reset function
    clientResetRef.current = resetWithFreshClient;
    
    fetchMessages();
  }, [conversationId, user]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || !conversationId) return;
    const oldest = messages[0]?.created_at;
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const workingClient = await getWorkingClient();
      const { data, error } = await workingClient
        .from('dm_messages')
        .select(
          `
          *,
          sender:users!sender_id(*)
        `)
        .eq('conversation_id', conversationId)
        .lt('created_at', oldest)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_FETCH_LIMIT);

      if (error) throw error;

      if (data && data.length > 0) {
        const newMessages = data.reverse();
        setMessages(prev => [...newMessages, ...prev]);
        setHasMore(data.length === MESSAGE_FETCH_LIMIT);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, conversationId, messages]);

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
            const workingClient = await getWorkingClient();
            const { data } = await workingClient
              .from('dm_messages')
              .select(`
                *,
                sender:users!sender_id(*)
              `)
              .eq('id', payload.new.id)
              .single();

            if (data) {
              setMessages(prev => {
                return prev.some(m => m.id === data.id) ? prev : [...prev, data];
              });

              // Mark as read if not sent by current user
              if (user && data.sender_id !== user.id) {
                await workingClient
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
            const workingClient = await getWorkingClient();
            const { data } = await workingClient
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
    subscribeRef.current = subscribeToChannel;
    channelRef.current = channel;
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  const sendMessage = useCallback(
    async (
      content: string,
      messageType: 'text' | 'command' | 'audio' | 'image' | 'file' = 'text',
      fileUrl?: string
    ): Promise<DMMessage | null> => {
    
      if (!user || !conversationId || !content.trim()) return null;

      setSending(true);
      try {
        const workingClient = await getWorkingClient();
        
        const { data, error } = await workingClient
          .from('dm_messages')
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content: content.trim(),
            message_type: messageType,
            file_url: fileUrl,
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
            const { error: refreshError } = await refreshSessionLocked();
            if (!refreshError) {
              const retryClient = await getWorkingClient();
              const retry = await retryClient
                .from('dm_messages')
                .insert({
                  conversation_id: conversationId,
                  sender_id: user.id,
                  content: content.trim(),
                  message_type: messageType,
                  file_url: fileUrl,
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
          return finalData as DMMessage;
        }
        return null;
      } catch (error) {
        throw error;
      } finally {
        setSending(false);
      }
    }, [user, conversationId]);

  return {
    messages,
    loading,
    sending,
    loadingMore,
    hasMore,
    sendMessage,
    loadOlderMessages,
  };
}

export function DirectMessagesProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideDirectMessages();
  return (
    <DirectMessagesContext.Provider value={value}>
      {children}
    </DirectMessagesContext.Provider>
  );
}

export function useDirectMessages() {
  const context = useContext(DirectMessagesContext);
  if (!context) {
    throw new Error('useDirectMessages must be used within a DirectMessagesProvider');
  }
  return context;
}
