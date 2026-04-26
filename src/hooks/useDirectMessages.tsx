/* eslint-disable react-refresh/only-export-components */
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
  getWorkingClient,
  getRealtimeClient,
  DMConversation,
  DMMessage,
  getOrCreateDMConversation,
  markDMMessagesRead,
  fetchDMConversations,
  ensureSession,
  recoverSessionAfterResume,
  refreshSessionLocked,
  resetRealtimeConnection,
  withTimeout,
} from '../lib/supabase';
import { triggerDMPushNotification } from '../lib/push';
import { MESSAGE_FETCH_LIMIT } from '../config';
import { useAuth } from './useAuth';
import { useVisibilityRefresh } from './useVisibilityRefresh';
import { useSoundEffects } from './useSoundEffects';
import { clearDMNotifications } from '../lib/appBadge';

interface DirectMessagesContextValue {
  conversations: DMConversation[];
  loading: boolean;
  currentConversation: string | null;
  setCurrentConversation: React.Dispatch<React.SetStateAction<string | null>>;
  messages: DMMessage[];
  sending: boolean;
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
const SEND_OPERATION_TIMEOUT_MS = 12000;

function useProvideDirectMessages(): DirectMessagesContextValue {
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const { user } = useAuth();
  const { playMessage } = useSoundEffects();
  const currentConversationRef = useRef<string | null>(null);
  const conversationsChannelRef = useRef<RealtimeChannel | null>(null);
  const conversationsSubscribeRef = useRef<(() => Promise<RealtimeChannel>) | null>(null);

  useEffect(() => {
    currentConversationRef.current = currentConversation;
  }, [currentConversation]);

  const refreshConversations = useCallback(async () => {
    try {
      const convs = await fetchDMConversations();
      setConversations(convs);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const resetWithFreshClient = useCallback(async () => {
    await refreshConversations();

    const existingChannel = conversationsChannelRef.current;
    const realtimeClient = getRealtimeClient();
    if (
      existingChannel &&
      realtimeClient?.removeChannel &&
      typeof realtimeClient.removeChannel === 'function'
    ) {
      try {
        realtimeClient.removeChannel(existingChannel);
      } catch {
        // ignore channel cleanup failures
      }
    }

    conversationsChannelRef.current = null;

    if (conversationsSubscribeRef.current) {
      try {
        const newChannel = await conversationsSubscribeRef.current();
        conversationsChannelRef.current = newChannel;
      } catch {
        // ignore resubscribe failures and wait for the next refresh
      }
    }
  }, [refreshConversations]);

  useVisibilityRefresh(() => {
    void resetWithFreshClient();
  });

  // Fetch conversations
  useEffect(() => {
    if (!user) return;

    void refreshConversations();
  }, [refreshConversations, user]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return;

    let channel: RealtimeChannel | null = null;
    let disposed = false;

    const subscribeToChannel = async (): Promise<RealtimeChannel> => {
      const realtimeClient =
        (await getWorkingClient().catch(() => getRealtimeClient())) ||
        getRealtimeClient();

      if (!realtimeClient?.channel || typeof realtimeClient.channel !== 'function') {
        throw new Error('Realtime client unavailable');
      }

      const nextChannel = realtimeClient
        .channel(`dm_messages:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'dm_messages',
          },
          (payload: any) => {
            let missing = false;

            setConversations(prev => {
              const convIndex = prev.findIndex(c => c.id === payload.new.conversation_id);
              if (convIndex >= 0) {
                const updated = [...prev];
                const isCurrent =
                  payload.new.conversation_id === currentConversationRef.current;
                let unread = updated[convIndex].unread_count;
                if (payload.new.sender_id !== user.id) {
                  unread = isCurrent ? 0 : (unread || 0) + 1;
                }

                updated[convIndex] = {
                  ...updated[convIndex],
                  last_message_at: payload.new.created_at,
                  last_message: {
                    id: payload.new.id,
                    conversation_id: payload.new.conversation_id,
                    sender_id: payload.new.sender_id,
                    content: payload.new.content,
                    message_type: payload.new.message_type ?? 'text',
                    audio_url: payload.new.audio_url ?? undefined,
                    file_url: payload.new.file_url ?? undefined,
                    read_at: payload.new.read_at,
                    reactions: payload.new.reactions,
                    edited_at: payload.new.edited_at,
                    created_at: payload.new.created_at,
                    updated_at: payload.new.updated_at ?? payload.new.created_at,
                  },
                  unread_count: unread,
                };
                const [moved] = updated.splice(convIndex, 1);
                updated.unshift(moved);
                return updated;
              }
              missing = true;
              return prev;
            });

            void refreshConversations();

            if (payload.new.sender_id !== user.id) {
              playMessage();
            }

            if (missing) {
              void refreshConversations();
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'dm_messages',
          },
          (payload: any) => {
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
        .subscribe(async (status: string) => {
          if (disposed) return;

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            try {
              await resetRealtimeConnection();
              await refreshConversations();
            } catch {
              // ignore reset failures and try a plain resubscribe below
            }
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            const activeChannel = conversationsChannelRef.current;
            if (
              activeChannel &&
              realtimeClient.removeChannel &&
              typeof realtimeClient.removeChannel === 'function'
            ) {
              try {
                realtimeClient.removeChannel(activeChannel);
              } catch {
                // ignore cleanup failures
              }
            }

            conversationsChannelRef.current = null;

            window.setTimeout(() => {
              if (disposed) return;
              subscribeToChannel()
                .then(resubscribedChannel => {
                  channel = resubscribedChannel;
                  conversationsChannelRef.current = resubscribedChannel;
                })
                .catch(() => {
                  // ignore resubscribe failures and wait for the next refresh
                });
            }, status === 'CLOSED' ? 1000 : 1500);
          }
        });

      return nextChannel;
    };

    conversationsSubscribeRef.current = subscribeToChannel;

    subscribeToChannel()
      .then(newChannel => {
        channel = newChannel;
        conversationsChannelRef.current = newChannel;
      })
      .catch(() => {
        // ignore realtime boot errors and rely on manual refresh/resubscribe paths
      });

    return () => {
      disposed = true;
      conversationsSubscribeRef.current = null;
      const realtimeClient = getRealtimeClient();
      const activeChannel = channel || conversationsChannelRef.current;
      if (
        activeChannel &&
        realtimeClient?.removeChannel &&
        typeof realtimeClient.removeChannel === 'function'
      ) {
        try {
          realtimeClient.removeChannel(activeChannel);
        } catch {
          // ignore cleanup failures
        }
      }
      conversationsChannelRef.current = null;
    };
  }, [playMessage, refreshConversations, user]);

  const {
    messages,
    sending,
    sendMessage: sendConversationMessage,
    loadingMore,
    hasMore,
    loadOlderMessages,
  } = useConversationMessages(currentConversation);

  const sendMessage = useCallback(
    async (
      content: string,
      messageType?: 'text' | 'command' | 'audio' | 'image' | 'file',
      fileUrl?: string
    ) => {
      const message = await sendConversationMessage(content, messageType, fileUrl);
      if (message) {
        void refreshConversations();
      }
      return message;
    },
    [refreshConversations, sendConversationMessage]
  );

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

    const match = otherUser as { id: string } | null;

    if (!match) {
      throw new Error('User not found');
    }

    const conversation = await getOrCreateDMConversation(match.id);
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
    void clearDMNotifications(conversationId);
    setConversations(prev =>
      prev.map(c =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c
      )
    );
    void refreshConversations();
  }, [refreshConversations]);

  return {
    conversations,
    loading,
    currentConversation,
    setCurrentConversation,
    messages,
    sending,
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
  const { playMessage } = useSoundEffects();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribeRef = useRef<() => RealtimeChannel>();
  const clientResetRef = useRef<() => Promise<void>>();
  const activeConversationIdRef = useRef<string | null>(conversationId);
  const fetchRequestIdRef = useRef(0);

  useEffect(() => {
    activeConversationIdRef.current = conversationId;
  }, [conversationId]);

  const insertConversationMessage = useCallback(
    async (
      payload: {
        conversation_id: string;
        sender_id: string;
        content: string;
        message_type: 'text' | 'command' | 'audio' | 'image' | 'file';
        file_url?: string;
        audio_url?: string;
      }
    ) => {
      const workingClient = await getWorkingClient();
      const insertPromise = workingClient
        .from('dm_messages')
        .insert(payload)
        .select(`
            *,
            sender:users!sender_id(*)
          `)
        .single();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('DM message insert timeout after 10 seconds')),
          10000
        )
      );

      return Promise.race([insertPromise, timeoutPromise]) as Promise<{
        data: DMMessage | null;
        error: any;
      }>;
    },
    []
  );

  const markVisibleMessagesRead = useCallback(
    async (pendingMessages: DMMessage[]) => {
      if (!conversationId || !user) return

      const unreadIds = pendingMessages
        .filter(
          message =>
            message.sender_id !== user.id &&
            !(message.read_by ?? []).includes(user.id)
        )
        .map(message => message.id)

      if (unreadIds.length === 0) {
        return
      }

      const readAt = new Date().toISOString()
      const unreadIdSet = new Set(unreadIds)

      await markDMMessagesRead(conversationId)
      void clearDMNotifications(conversationId)

      if (activeConversationIdRef.current !== conversationId) {
        return
      }

      setMessages(prev =>
        prev.map(message => {
          if (!unreadIdSet.has(message.id)) {
            return message
          }

          const readBy = message.read_by ?? []
          if (readBy.includes(user.id)) {
            return {
              ...message,
              read_at: message.read_at ?? readAt,
            }
          }

          return {
            ...message,
            read_at: message.read_at ?? readAt,
            read_by: [...readBy, user.id],
          }
        })
      )
    },
    [conversationId, user]
  )

  const handleVisible = useCallback(() => {
    if (clientResetRef.current) {
      void clientResetRef.current();
    }
  }, []);

  useVisibilityRefresh(handleVisible);

  // Fetch messages for conversation
  useEffect(() => {
    if (!conversationId) {
      fetchRequestIdRef.current += 1;
      clientResetRef.current = undefined;
      setMessages([]);
      setHasMore(true);
      setLoading(false);
      return;
    }

    let disposed = false;

    const fetchMessages = async () => {
      const requestId = fetchRequestIdRef.current + 1;
      fetchRequestIdRef.current = requestId;
      setLoading(true);

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
          .order('created_at', { ascending: false })
          .limit(MESSAGE_FETCH_LIMIT);

        if (disposed || requestId !== fetchRequestIdRef.current) {
          return;
        }

        if (error) {
          setMessages([]);
          setHasMore(false);
        } else {
          const fetchedMessages = ((data || []) as unknown as DMMessage[]).reverse()
          setHasMore((data?.length || 0) === MESSAGE_FETCH_LIMIT);
          setMessages(fetchedMessages);
          await markVisibleMessagesRead(fetchedMessages).catch(() => undefined)
        }
      } catch {
        if (!disposed && requestId === fetchRequestIdRef.current) {
          setMessages([]);
          setHasMore(false);
        }
      } finally {
        if (!disposed && requestId === fetchRequestIdRef.current) {
          setLoading(false);
        }
      }
    };

    const resetWithFreshClient = async () => {
      if (!conversationId || disposed) return;

      const activeChannel = channelRef.current;
      const realtimeClient = getRealtimeClient();
      if (
        activeChannel &&
        realtimeClient?.removeChannel &&
        typeof realtimeClient.removeChannel === 'function'
      ) {
        try {
          realtimeClient.removeChannel(activeChannel);
        } catch {
          // ignore channel cleanup failures
        }
      }

      channelRef.current = null;

      try {
        const newChannel = subscribeRef.current?.();
        if (newChannel) {
          channelRef.current = newChannel;
        }
      } catch {
        // ignore resubscribe failures; the fetch still repairs visible state
      }

      await fetchMessages();
    };

    clientResetRef.current = resetWithFreshClient;

    setMessages([]);
    setHasMore(true);
    void fetchMessages();

    return () => {
      disposed = true;
      fetchRequestIdRef.current += 1;
      if (clientResetRef.current === resetWithFreshClient) {
        clientResetRef.current = undefined;
      }
    };
  }, [conversationId, markVisibleMessagesRead, user]);

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

      if (activeConversationIdRef.current !== conversationId) {
        return;
      }

      if (data && data.length > 0) {
        const newMessages = (data as unknown as DMMessage[]).reverse();
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
    if (!getRealtimeClient()?.channel) return;

    let channel: RealtimeChannel | null = null;
    let disposed = false;

    const subscribeToChannel = (): RealtimeChannel => {
      const realtimeClient = getRealtimeClient()
      if (!realtimeClient?.channel) {
        throw new Error('Realtime client unavailable')
      }

      const newChannel = realtimeClient
        .channel(`dm_messages:${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'dm_messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          async (payload: any) => {
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

            const message = data as unknown as DMMessage | null;

            if (disposed) return;

            if (message) {
              setMessages(prev => {
                return prev.some(m => m.id === message.id) ? prev : [...prev, message];
              });

              // Mark as read if not sent by current user
              if (user && message.sender_id !== user.id) {
                playMessage();
                await markVisibleMessagesRead([message])
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
          async (payload: any) => {
            const workingClient = await getWorkingClient();
            const { data } = await workingClient
              .from('dm_messages')
              .select(`
                *,
                sender:users!sender_id(*)
              `)
              .eq('id', payload.new.id)
              .single();

            const message = data as unknown as DMMessage | null;

            if (disposed) return;

            if (message) {
              setMessages(prev =>
                prev.map(m => (m.id === message.id ? message : m))
              );
            }
          }
        )
        .subscribe(async (status: string) => {
          if (disposed) return;

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            try {
              await resetRealtimeConnection();
            } catch {
              // ignore reset failures and fall back to resubscribe below
            }
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            const activeChannel = channelRef.current;
            if (
              activeChannel &&
              realtimeClient.removeChannel &&
              typeof realtimeClient.removeChannel === 'function'
            ) {
              try {
                realtimeClient.removeChannel(activeChannel);
              } catch {
                // ignore cleanup failures
              }
            }

            channelRef.current = null;

            window.setTimeout(() => {
              if (disposed) return;
              try {
                const resubscribedChannel = subscribeToChannel();
                channel = resubscribedChannel;
                channelRef.current = resubscribedChannel;
              } catch {
                // ignore resubscribe failures and wait for the next visibility refresh
              }
            }, status === 'CLOSED' ? 1000 : 1500);
          }
        });

      return newChannel;
    };

    channel = subscribeToChannel();
    subscribeRef.current = subscribeToChannel;
    channelRef.current = channel;
    return () => {
      disposed = true;
      const realtimeClient = getRealtimeClient();
      if (channel && realtimeClient?.removeChannel) {
        realtimeClient.removeChannel(channel);
      }
      channelRef.current = null;
    };
  }, [conversationId, markVisibleMessagesRead, user, playMessage]);

  const sendMessage = useCallback(
    async (
      content: string,
      messageType: 'text' | 'command' | 'audio' | 'image' | 'file' = 'text',
      fileUrl?: string
    ): Promise<DMMessage | null> => {
    
      const trimmedContent = content.trim();
      const requiresContent = messageType !== 'audio' && messageType !== 'image' && messageType !== 'file';
      if (!user || !conversationId || (requiresContent && !trimmedContent)) return null;

      setSending(true);
      try {
        return await withTimeout(
          (async () => {
            const sessionValid = await ensureSession();
            if (!sessionValid) {
              throw new Error('Authentication session is invalid or expired. Please refresh the page and try again.');
            }

            const insertPayload = {
              conversation_id: conversationId,
              sender_id: user.id,
              content: messageType === 'audio' ? '' : trimmedContent,
              message_type: messageType,
              file_url: fileUrl,
              ...(messageType === 'audio' ? { audio_url: trimmedContent } : {}),
            };

            const { data, error } = await insertConversationMessage(insertPayload);

            let finalData = data as unknown;
            let finalError = error as any;
            if (finalError) {
              if (finalError.status === 401 || /jwt|token|expired/i.test(finalError.message ?? '')) {
                const forcedSessionValid = await ensureSession(true);
                if (forcedSessionValid) {
                  const retry = await insertConversationMessage(insertPayload);
                  finalData = retry.data as unknown;
                  finalError = retry.error;
                } else {
                  const { error: refreshError } = await refreshSessionLocked();
                  if (!refreshError) {
                    const retry = await insertConversationMessage(insertPayload);
                    finalData = retry.data as unknown;
                    finalError = retry.error;
                  }
                }
              }
              if (finalError) throw finalError;
            }

            if (finalData) {
              const message = finalData as DMMessage;
              // Optimistically add the sent message
              setMessages(prev => [...prev, message]);
              if (message.id) {
                triggerDMPushNotification(message.id).catch(() => {
                  // Push delivery should not block the DM send path.
                });
              }
              return message;
            }
            return null;
          })(),
          SEND_OPERATION_TIMEOUT_MS,
          'Message send timed out while reconnecting. Please try again.'
        );
      } catch (error) {
        await recoverSessionAfterResume().catch(() => false);
        await resetRealtimeConnection().catch(() => undefined);
        throw error;
      } finally {
        setSending(false);
      }
    }, [user, conversationId, insertConversationMessage]);

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
