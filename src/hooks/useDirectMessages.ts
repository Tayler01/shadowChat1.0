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
  DEBUG,
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
  startConversation: (username: string) => Promise<string | null>;
  sendMessage: (
    content: string,
    messageType?: 'text' | 'command' | 'audio' | 'image',
    fileUrl?: string
  ) => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
}

const DirectMessagesContext = createContext<DirectMessagesContextValue | undefined>(undefined);

function useProvideDirectMessages(): DirectMessagesContextValue {
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const { user } = useAuth();

  // Reset function for page refocus
  const resetWithFreshClient = useCallback(async () => {
    if (DEBUG) {
      console.log('🔄 [DM] resetWithFreshClient: Starting...')
    }
    
    try {
      // Refetch conversations with new client
      if (DEBUG) console.log('📥 [DM] Refetching conversations...')
      const convs = await fetchDMConversations();
      setConversations(convs);
      if (DEBUG) console.log('✅ [DM] Conversations refetched:', convs.length)
      
      if (DEBUG) console.log('✅ [DM] resetWithFreshClient: Complete')
    } catch (error) {
      if (DEBUG) console.error('❌ [DM] resetWithFreshClient: Failed:', error)
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
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribeRef = useRef<() => RealtimeChannel>();
  const clientResetRef = useRef<() => Promise<void>>();

  const handleVisible = useCallback(() => {
    const channel = channelRef.current;
    if (channel && channel.state !== 'joined') {
      if (DEBUG) console.log('🌀 [DM] handleVisible: Resubscribing channel due to state:', channel.state)
      supabase.removeChannel(channel);
      const newChannel = subscribeRef.current?.();
      if (newChannel) {
        channelRef.current = newChannel;
        if (DEBUG) console.log('✅ [DM] handleVisible: Channel resubscribed')
      }
    }
    
    // Use reset function if available
    if (clientResetRef.current) {
      if (DEBUG) console.log('🔄 [DM] handleVisible: Triggering client reset...')
      clientResetRef.current()
    } else {
      if (DEBUG) console.log('⚠️ [DM] handleVisible: No reset function available')
    }
  }, []);

  useVisibilityRefresh(handleVisible);

  // Fetch messages for conversation
  useEffect(() => {
    const resetWithFreshClient = async () => {
      if (!conversationId) return
      
      if (DEBUG) {
        console.log('🔄 [DM_CONV] resetWithFreshClient: Starting...', { conversationId })
      }
      
      try {
        // Clean up old channel
        if (channelRef.current) {
          if (DEBUG) console.log('🗑️ [DM_CONV] Removing old realtime channel...')
          // Channel cleanup will be handled by the useEffect cleanup
          channelRef.current = null
          if (DEBUG) console.log('✅ [DM_CONV] Old channel removed')
        }
        
        // Refetch messages and resubscribe
        // This will be handled by the existing useEffect logic
        if (DEBUG) console.log('📥 [DM_CONV] Messages will be refetched by useEffect...')
        
        if (DEBUG) console.log('✅ [DM_CONV] resetWithFreshClient: Complete')
      } catch (error) {
        if (DEBUG) console.error('❌ [DM_CONV] resetWithFreshClient: Failed:', error)
      }
    }
    
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const fetchMessages = async () => {
      const workingClient = await getWorkingClient();
      const { data, error } = await workingClient
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
      messageType: 'text' | 'command' | 'audio' | 'image' = 'text',
      fileUrl?: string
    ) => {
    if (DEBUG) console.log('🚀 [DM_CONV] sendMessage: Starting...', {
      conversationId,
      messageType,
      hasContent: !!content,
      hasFileUrl: !!fileUrl
    })
    
    if (!user || !conversationId || !content.trim()) return;

    setSending(true);
    try {
      if (DEBUG) console.log('📤 [DM_CONV] sendMessage: Getting working client...')
      const workingClient = await getWorkingClient();
      if (DEBUG) console.log('📤 [DM_CONV] sendMessage: Inserting message...')
      
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
          if (DEBUG) console.log('🔄 [DM_CONV] sendMessage: Auth error, refreshing session...')
          const { error: refreshError } = await refreshSessionLocked();
          if (!refreshError) {
            if (DEBUG) console.log('🔄 [DM_CONV] sendMessage: Session refreshed, retrying...')
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
            if (DEBUG) console.log('🔄 [DM_CONV] sendMessage: Retry result:', { hasData: !!finalData, hasError: !!finalError })
          }
        }
        if (finalError) throw finalError;
      }

      if (finalData) {
        if (DEBUG) console.log('✅ [DM_CONV] sendMessage: Message inserted successfully')
        // Optimistically add the sent message
        setMessages(prev => [...prev, finalData as DMMessage]);
        if (DEBUG) console.log('✅ [DM_CONV] sendMessage: Local state updated')
      }
    } catch (error) {
      if (DEBUG) console.error('❌ [DM_CONV] sendMessage: Error:', error);
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