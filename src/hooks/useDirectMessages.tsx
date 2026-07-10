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
  type ChatMessageType,
  getOrCreateDMConversation,
  markDMMessagesRead,
  fetchDMConversations,
  ensureSession,
  refreshSessionLocked,
  withTimeout,
} from '../lib/supabase';
import { runRealtimeRecovery } from '../lib/realtimeRecovery';
import { createRealtimeChannelName } from '../lib/realtimeChannelName';
import { triggerDMPushNotification } from '../lib/push';
import {
  createClientMessageId,
  isClientMessageIdSchemaError,
  isMediaThumbnailSchemaError,
  isReplyToSchemaError,
  markMessageSendFailed,
  mergeRealtimeMessageUpdate,
  upsertMessageIntoState,
} from '../lib/optimisticMessages';
import { MESSAGE_FETCH_LIMIT } from '../config';
import { useAuth } from './useAuth';
import { useRealtimeRecovery } from './useRealtimeRecovery';
import { useSoundEffects } from './useSoundEffects';
import { clearDMNotifications } from '../lib/appBadge';
import { compareMessageKey } from '../lib/readCursors';
import {
  createRealtimeSubscriptionManager,
  isRecoverableRealtimeStatus,
} from '../lib/realtimeSubscription';
import {
  loadLocalOutboxEntries,
  removeLocalOutboxEntry,
  upsertLocalOutboxEntry,
  type LocalMessageOutboxEntry,
} from '../lib/localMessageOutbox';

interface DirectMessagesContextValue {
  conversations: DMConversation[];
  loading: boolean;
  currentConversation: string | null;
  setCurrentConversation: React.Dispatch<React.SetStateAction<string | null>>;
  messages: DMMessage[];
  messagesConversationId: string | null;
  messagesLoading: boolean;
  sending: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  startConversation: (username: string) => Promise<string | null>;
  sendMessage: (
    content: string,
    messageType?: ChatMessageType,
    fileUrl?: string,
    replyTo?: string,
    thumbnailUrl?: string | null
  ) => Promise<DMMessage | null>;
  retryFailedMessage: (messageId: string) => Promise<DMMessage | null>;
  discardFailedMessage: (messageId: string) => void;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
}

const DirectMessagesContext = createContext<DirectMessagesContextValue | undefined>(undefined);
const SEND_OPERATION_TIMEOUT_MS = 12000;

const getDMOutboxScope = (conversationId: string) => `dm:${conversationId}`;

const sortDMMessagesByCreatedAt = (items: DMMessage[]) =>
  [...items].sort((a, b) => compareMessageKey(a, b));

const isServerDMCursorMessage = (message: DMMessage) => (
  Boolean(message.id && message.created_at) &&
  !message.optimistic &&
  message.delivery_status !== 'sending' &&
  message.delivery_status !== 'failed'
);

const getOldestServerDMCursor = (items: DMMessage[]) => (
  sortDMMessagesByCreatedAt(items.filter(isServerDMCursorMessage))[0] ?? null
);

const buildOlderDMKeysetFilter = (anchor: Pick<DMMessage, 'created_at' | 'id'>) =>
  `created_at.lt.${anchor.created_at},and(created_at.eq.${anchor.created_at},id.lt.${anchor.id})`;

const mergeDMMessagesByStableKey = (items: DMMessage[]) => sortDMMessagesByCreatedAt(
  items.reduce<DMMessage[]>((acc, message) => upsertMessageIntoState(acc, message), [])
);

const localOutboxEntryToDMMessage = (
  entry: LocalMessageOutboxEntry,
  conversationId: string,
  user?: Partial<NonNullable<DMMessage['sender']>> | null
) => ({
  id: entry.clientMessageId,
  client_message_id: entry.clientMessageId,
  conversation_id: conversationId,
  sender_id: entry.senderId,
  content: entry.messageType === 'audio' ? '' : entry.content,
  message_type: entry.messageType,
  file_url: entry.fileUrl,
  thumbnail_url: entry.thumbnailUrl ?? null,
  ...(entry.replyTo ? { reply_to: entry.replyTo } : {}),
  ...(entry.messageType === 'audio' ? { audio_url: entry.content } : {}),
  read_at: undefined,
  read_by: [entry.senderId],
  reactions: {},
  created_at: entry.createdAt,
  updated_at: entry.failedAt,
  sender: user,
  optimistic: true,
  delivery_status: 'failed',
} as DMMessage);

type SendDMMessageOptions = {
  clientMessageId?: string;
  createdAt?: string;
}

type FetchConversationMessagesOptions = {
  silent?: boolean;
}

function useProvideDirectMessages(): DirectMessagesContextValue {
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const { user } = useAuth();
  const { playMessage } = useSoundEffects();
  const dmMessagesSubscriptionRef = useRef<ReturnType<typeof createRealtimeSubscriptionManager> | null>(null);
  const refreshConversationsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeMessageHandlersRef = useRef<{
    insert: (incoming: Partial<DMMessage>) => void | Promise<void>;
    update: (incoming: Partial<DMMessage>) => void;
  }>({
    insert: () => undefined,
    update: () => undefined,
  });

  const {
    messages,
    conversationId: messagesConversationId,
    loading: messagesLoading,
    sending,
    sendMessage: sendConversationMessage,
    retryFailedMessage: retryConversationFailedMessage,
    discardFailedMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    loadingMore,
    hasMore,
    loadOlderMessages,
    handleRealtimeInsert,
    handleRealtimeUpdate,
    refreshVisibleMessages,
  } = useConversationMessages(currentConversation);

  activeMessageHandlersRef.current = {
    insert: handleRealtimeInsert,
    update: handleRealtimeUpdate,
  };

  const refreshConversations = useCallback(async () => {
    try {
      const convs = await fetchDMConversations();
      setConversations(convs);
    } catch {
      // Keep the last known inbox during transient resume/network failures.
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshConversationsDebounced = useCallback((delay = 250) => {
    if (refreshConversationsTimerRef.current) {
      clearTimeout(refreshConversationsTimerRef.current);
    }

    refreshConversationsTimerRef.current = setTimeout(() => {
      refreshConversationsTimerRef.current = null;
      void refreshConversations();
    }, delay);
  }, [refreshConversations]);

  useEffect(() => {
    return () => {
      if (refreshConversationsTimerRef.current) {
        clearTimeout(refreshConversationsTimerRef.current);
      }
    };
  }, []);

  const resetWithFreshClient = useCallback(async () => {
    await refreshConversations();
    await Promise.allSettled([
      refreshVisibleMessages(),
      dmMessagesSubscriptionRef.current?.resubscribe() ?? Promise.resolve(null),
    ]);
  }, [refreshConversations, refreshVisibleMessages]);

  useRealtimeRecovery(() => {
    void resetWithFreshClient();
  });

  // Fetch conversations
  useEffect(() => {
    if (!user) return;

    void refreshConversations();
  }, [refreshConversations, user]);

  // One inbox-wide channel owns both conversation summaries and the active thread.
  useEffect(() => {
    if (!user) return;

    let disposed = false;
    let latestChannel: RealtimeChannel | null = null;
    const manager = createRealtimeSubscriptionManager({ getFallbackClient: getRealtimeClient });
    dmMessagesSubscriptionRef.current = manager;

    const subscribeToChannel = async () => {
      const realtimeClient =
        (await getWorkingClient().catch(() => getRealtimeClient())) ||
        getRealtimeClient();

      if (!realtimeClient?.channel || typeof realtimeClient.channel !== 'function') {
        throw new Error('Realtime client unavailable');
      }

      const nextChannel = realtimeClient
        .channel(createRealtimeChannelName(`dm_messages:${user.id}`))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'dm_messages' },
          (payload: any) => {
            const incoming = payload.new as Partial<DMMessage>;
            if (!incoming.id || !incoming.conversation_id || !incoming.sender_id || !incoming.created_at) {
              void refreshConversations();
              return;
            }
            const incomingId = incoming.id;
            const incomingConversationId = incoming.conversation_id;
            const incomingSenderId = incoming.sender_id;
            const incomingCreatedAt = incoming.created_at;
            let missing = false;

            setConversations(prev => {
              const convIndex = prev.findIndex(c => c.id === incomingConversationId);
              if (convIndex < 0) {
                missing = true;
                return prev;
              }

              const updated = [...prev];
              let unread = updated[convIndex].unread_count;
              if (incomingSenderId !== user.id) {
                unread = (unread || 0) + 1;
              }

              updated[convIndex] = {
                ...updated[convIndex],
                last_message_at: incomingCreatedAt,
                last_message: {
                  id: incomingId,
                  conversation_id: incomingConversationId,
                  sender_id: incomingSenderId,
                  client_message_id: incoming.client_message_id,
                  content: incoming.content ?? '',
                  message_type: incoming.message_type ?? 'text',
                  audio_url: incoming.audio_url ?? undefined,
                  file_url: incoming.file_url ?? undefined,
                  thumbnail_url: incoming.thumbnail_url ?? undefined,
                  media_processed_at: incoming.media_processed_at ?? undefined,
                  reply_to: incoming.reply_to ?? undefined,
                  read_at: incoming.read_at,
                  reactions: incoming.reactions ?? {},
                  edited_at: incoming.edited_at,
                  created_at: incomingCreatedAt,
                  updated_at: incoming.updated_at ?? incomingCreatedAt,
                },
                unread_count: unread,
              };
              const [moved] = updated.splice(convIndex, 1);
              updated.unshift(moved);
              return updated;
            });

            if (missing) {
              void refreshConversations();
            } else {
              refreshConversationsDebounced();
            }

            void activeMessageHandlersRef.current.insert(incoming);
            if (incomingSenderId !== user.id) {
              playMessage();
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'dm_messages' },
          (payload: any) => {
            const incoming = payload.new as Partial<DMMessage>;
            setConversations(prev => {
              const convIndex = prev.findIndex(c => c.id === incoming.conversation_id);
              if (convIndex >= 0 && prev[convIndex].last_message?.id === incoming.id) {
                const updated = [...prev];
                updated[convIndex] = {
                  ...updated[convIndex],
                  last_message: {
                    ...updated[convIndex].last_message!,
                    reactions: incoming.reactions ?? updated[convIndex].last_message!.reactions,
                    content: incoming.content ?? updated[convIndex].last_message!.content,
                    read_at: incoming.read_at,
                    edited_at: incoming.edited_at,
                  },
                };
                return updated;
              }
              return prev;
            });

            activeMessageHandlersRef.current.update(incoming);
          }
        );

      latestChannel = nextChannel;
      nextChannel.subscribe(async (status: string) => {
        if (disposed || latestChannel !== nextChannel) return;

        if (isRecoverableRealtimeStatus(status)) {
          try {
            await runRealtimeRecovery('channel-error');
            await refreshConversations();
          } catch {
            // A scheduled plain resubscribe remains available below.
          }
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          manager.scheduleResubscribe(status === 'CLOSED' ? 1000 : 1500);
        }
      });

      return { channel: nextChannel, client: realtimeClient };
    };

    manager.setSubscribe(subscribeToChannel);
    void manager.start().catch(() => {
      // Manual refresh and the recovery event repair a transient boot failure.
    });

    return () => {
      disposed = true;
      latestChannel = null;
      manager.clearSubscribe(subscribeToChannel);
      void manager.stop();
      if (dmMessagesSubscriptionRef.current === manager) {
        dmMessagesSubscriptionRef.current = null;
      }
    };
  }, [playMessage, refreshConversations, refreshConversationsDebounced, user]);

  const sendMessage = useCallback(
    async (
      content: string,
      messageType?: ChatMessageType,
      fileUrl?: string,
      replyTo?: string,
      thumbnailUrl?: string | null
    ) => {
      const message = await sendConversationMessage(content, messageType, fileUrl, replyTo, thumbnailUrl);
      if (message) {
        refreshConversationsDebounced();
      }
      return message;
    },
    [refreshConversationsDebounced, sendConversationMessage]
  );

  const retryFailedMessage = useCallback(async (messageId: string) => {
    const message = await retryConversationFailedMessage(messageId);
    if (message) {
      refreshConversationsDebounced();
    }
    return message;
  }, [refreshConversationsDebounced, retryConversationFailedMessage]);

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

    const conversationId = await getOrCreateDMConversation(match.id);
    if (conversationId) {
      const convs = await fetchDMConversations();
      setConversations(convs);
      setCurrentConversation(conversationId);
      return conversationId;
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
    refreshConversationsDebounced();
  }, [refreshConversationsDebounced]);

  return {
    conversations,
    loading,
    currentConversation,
    setCurrentConversation,
    messages,
    messagesConversationId,
    messagesLoading,
    sending,
    loadingMore,
    hasMore,
    startConversation,
    sendMessage,
    retryFailedMessage,
    discardFailedMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    markAsRead,
    loadOlderMessages,
  };
}

export function useConversationMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const { user, profile } = useAuth();
  const clientResetRef = useRef<() => Promise<void>>();
  const activeConversationIdRef = useRef<string | null>(conversationId);
  const fetchRequestIdRef = useRef(0);
  const sendingRef = useRef(false);
  const latestMessagesRef = useRef<DMMessage[]>([]);
  const hydrationFetchesRef = useRef<Map<string, Promise<DMMessage | null>>>(new Map());

  useEffect(() => {
    activeConversationIdRef.current = conversationId;
    hydrationFetchesRef.current.clear();
  }, [conversationId]);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  const hydrateLocalOutboxMessages = useCallback(() => {
    if (!user?.id || !conversationId) return;

    const entries = loadLocalOutboxEntries(getDMOutboxScope(conversationId))
      .filter(entry => entry.senderId === user.id);
    if (entries.length === 0) return;

    setMessages(prev => sortDMMessagesByCreatedAt(entries.reduce<DMMessage[]>(
      (acc, entry) => upsertMessageIntoState(acc, localOutboxEntryToDMMessage(entry, conversationId, profile ?? user)),
      prev
    )));
  }, [conversationId, profile, user]);

  const insertConversationMessage = useCallback(
    async (
      payload: {
        conversation_id: string;
        sender_id: string;
        client_message_id?: string;
        content: string;
        message_type: ChatMessageType;
        file_url?: string;
        thumbnail_url?: string;
        media_processed_at?: string;
        audio_url?: string;
        reply_to?: string;
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

      let result = (await Promise.race([insertPromise, timeoutPromise])) as {
        data: DMMessage | null;
        error: any;
      };

      if (result.error && isMediaThumbnailSchemaError(result.error)) {
        const {
          thumbnail_url: _thumbnailUrl,
          media_processed_at: _mediaProcessedAt,
          ...legacyMediaPayload
        } = payload;
        const legacyMediaInsertPromise = workingClient
          .from('dm_messages')
          .insert(legacyMediaPayload)
          .select(`
            *,
            sender:users!sender_id(*)
          `)
          .single();

        result = (await Promise.race([legacyMediaInsertPromise, timeoutPromise])) as {
          data: DMMessage | null;
          error: any;
        };
      }

      if (result.error && payload.reply_to && isReplyToSchemaError(result.error)) {
        const {
          reply_to: _replyTo,
          ...legacyReplyPayload
        } = payload;
        const legacyReplyInsertPromise = workingClient
          .from('dm_messages')
          .insert(legacyReplyPayload)
          .select(`
            *,
            sender:users!sender_id(*)
          `)
          .single();

        result = (await Promise.race([legacyReplyInsertPromise, timeoutPromise])) as {
          data: DMMessage | null;
          error: any;
        };
      }

      if (result.error && payload.client_message_id && isClientMessageIdSchemaError(result.error)) {
        const {
          client_message_id: _clientMessageId,
          thumbnail_url: _thumbnailUrl,
          media_processed_at: _mediaProcessedAt,
          ...legacyPayload
        } = payload;
        const legacyInsertPromise = workingClient
          .from('dm_messages')
          .insert(legacyPayload)
          .select(`
            *,
            sender:users!sender_id(*)
          `)
          .single();

        result = (await Promise.race([legacyInsertPromise, timeoutPromise])) as {
          data: DMMessage | null;
          error: any;
        };
      }

      if (result.error && payload.reply_to && isReplyToSchemaError(result.error)) {
        const {
          reply_to: _replyTo,
          ...legacyReplyPayload
        } = payload;
        const legacyReplyInsertPromise = workingClient
          .from('dm_messages')
          .insert(legacyReplyPayload)
          .select(`
            *,
            sender:users!sender_id(*)
          `)
          .single();

        result = (await Promise.race([legacyReplyInsertPromise, timeoutPromise])) as {
          data: DMMessage | null;
          error: any;
        };
      }

      if (
        result.error &&
        payload.client_message_id &&
        (result.error.code === '23505' || result.error.status === 409)
      ) {
        result = await workingClient
          .from('dm_messages')
          .select(`
            *,
            sender:users!sender_id(*)
          `)
          .eq('sender_id', payload.sender_id)
          .eq('client_message_id', payload.client_message_id)
          .maybeSingle();
      }

      return result;
    },
    []
  );

  const fetchConversationMessage = useCallback(async (messageId: string) => {
    if (!conversationId) return null;

    const workingClient = await getWorkingClient();
    const { data, error } = await workingClient
      .from('dm_messages')
      .select(`
        *,
        sender:users!sender_id(*)
      `)
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (error || !data) return null;
    return data as unknown as DMMessage;
  }, [conversationId]);

  const hydrateConversationMessage = useCallback((messageId: string) => {
    if (!conversationId) return Promise.resolve(null);

    const existing = hydrationFetchesRef.current.get(messageId);
    if (existing) return existing;

    const request = getWorkingClient()
      .then(workingClient =>
        workingClient
          .from('dm_messages')
          .select(`
            *,
            sender:users!sender_id(*)
          `)
          .eq('id', messageId)
          .eq('conversation_id', conversationId)
          .maybeSingle()
      )
      .then(({ data, error }) => (error || !data ? null : data as unknown as DMMessage))
      .catch(() => null)
      .finally(() => {
        hydrationFetchesRef.current.delete(messageId);
      });

    hydrationFetchesRef.current.set(messageId, request);
    return request;
  }, [conversationId]);

  const refreshVisibleMessages = useCallback(async () => {
    await clientResetRef.current?.();
  }, []);

  // Fetch messages for conversation
  useEffect(() => {
    if (!conversationId) {
      fetchRequestIdRef.current += 1;
      clientResetRef.current = undefined;
      setMessages([]);
      setLoadedConversationId(null);
      setHasMore(true);
      setLoading(false);
      return;
    }

    let disposed = false;

    const fetchMessages = async (options: FetchConversationMessagesOptions = {}) => {
      const requestId = fetchRequestIdRef.current + 1;
      fetchRequestIdRef.current = requestId;
      if (!options.silent) {
        setLoadedConversationId(null);
        setLoading(true);
      }

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
          .order('id', { ascending: false })
          .limit(MESSAGE_FETCH_LIMIT);

        if (disposed || requestId !== fetchRequestIdRef.current) {
          return;
        }

        if (error) {
          if (!options.silent) {
            setMessages(prev => prev.filter(
              message => message.optimistic || message.delivery_status === 'sending' || message.delivery_status === 'failed'
            ));
            setHasMore(false);
          }
        } else {
          const fetchedMessages = ((data || []) as unknown as DMMessage[]).reverse()
          setHasMore((data?.length || 0) === MESSAGE_FETCH_LIMIT);
          setMessages(prev => {
            const pendingLocalMessages = prev.filter(
              message => message.optimistic || message.delivery_status === 'sending' || message.delivery_status === 'failed'
            );
            return sortDMMessagesByCreatedAt(fetchedMessages.reduce<DMMessage[]>(
              (acc, message) => upsertMessageIntoState(acc, { ...message, optimistic: false, delivery_status: 'sent' }),
              pendingLocalMessages
            ));
          });
        }
      } catch {
        if (!disposed && requestId === fetchRequestIdRef.current) {
          if (!options.silent) {
            setMessages(prev => prev.filter(
              message => message.optimistic || message.delivery_status === 'sending' || message.delivery_status === 'failed'
            ));
            setHasMore(false);
          }
        }
      } finally {
        if (!disposed && requestId === fetchRequestIdRef.current) {
          setLoadedConversationId(conversationId);
          setLoading(false);
        }
      }
    };

    const resetWithFreshClient = async () => {
      if (!conversationId || disposed) return;
      await fetchMessages({ silent: true });
    };

    clientResetRef.current = resetWithFreshClient;

    setMessages([]);
    setLoadedConversationId(null);
    setHasMore(true);
    void fetchMessages();

    return () => {
      disposed = true;
      fetchRequestIdRef.current += 1;
      if (clientResetRef.current === resetWithFreshClient) {
        clientResetRef.current = undefined;
      }
    };
  }, [conversationId, user]);

  useEffect(() => {
    hydrateLocalOutboxMessages();
  }, [hydrateLocalOutboxMessages]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore || !conversationId) return;
    const oldest = getOldestServerDMCursor(messages);
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
        .or(buildOlderDMKeysetFilter(oldest))
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MESSAGE_FETCH_LIMIT);

      if (error) throw error;

      if (activeConversationIdRef.current !== conversationId) {
        return;
      }

      if (data && data.length > 0) {
        const newMessages = (data as unknown as DMMessage[]).reverse();
        setMessages(prev => mergeDMMessagesByStableKey([...newMessages, ...prev]));
        setHasMore(data.length === MESSAGE_FETCH_LIMIT);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, conversationId, messages]);

  const handleRealtimeInsert = useCallback(async (incoming: Partial<DMMessage>) => {
    const activeConversationId = activeConversationIdRef.current;
    if (!activeConversationId || incoming.conversation_id !== activeConversationId || !incoming.id) return;

    const alreadyHydrated = latestMessagesRef.current.some(message =>
      message.id === incoming.id && !message.optimistic && Boolean(message.sender)
    );
    if (alreadyHydrated) return;

    const message = await hydrateConversationMessage(incoming.id);
    if (!message || activeConversationIdRef.current !== incoming.conversation_id) return;

    setMessages(prev => upsertMessageIntoState(prev, {
      ...message,
      optimistic: false,
      delivery_status: 'sent',
    }));
  }, [hydrateConversationMessage]);

  const handleRealtimeUpdate = useCallback((incoming: Partial<DMMessage>) => {
    if (
      !incoming.id ||
      !incoming.conversation_id ||
      activeConversationIdRef.current !== incoming.conversation_id
    ) return;

    setMessages(prev => {
      const existing = prev.find(message => message.id === incoming.id);
      if (!existing) return prev;

      const merged = mergeRealtimeMessageUpdate(existing, incoming, { sender: existing.sender });
      return merged ? upsertMessageIntoState(prev, merged) : prev;
    });
  }, []);

  const sendMessage = useCallback(
    async (
      content: string,
      messageType: ChatMessageType = 'text',
      fileUrl?: string,
      replyTo?: string,
      thumbnailUrl?: string | null,
      options: SendDMMessageOptions = {}
    ): Promise<DMMessage | null> => {
    
      const trimmedContent = content.trim();
      const requiresContent = messageType !== 'audio' && messageType !== 'image' && messageType !== 'video' && messageType !== 'file';
      if (!user || !conversationId || (requiresContent && !trimmedContent)) return null;

      if (sendingRef.current) {
        return null;
      }

      sendingRef.current = true;
      setSending(true);
      const clientMessageId = options.clientMessageId || createClientMessageId();
      const createdAt = options.createdAt || new Date().toISOString();
      const optimisticMessage = {
        id: clientMessageId,
        client_message_id: clientMessageId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: messageType === 'audio' ? '' : trimmedContent,
        message_type: messageType,
        file_url: fileUrl,
        ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl, media_processed_at: createdAt } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(messageType === 'audio' ? { audio_url: trimmedContent } : {}),
        read_at: undefined,
        read_by: [user.id],
        reactions: {},
        created_at: createdAt,
        updated_at: createdAt,
        sender: profile ?? user,
        optimistic: true,
        delivery_status: 'sending',
      } as DMMessage;
      setMessages(prev => upsertMessageIntoState(prev, optimisticMessage));

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
              client_message_id: clientMessageId,
              content: messageType === 'audio' ? '' : trimmedContent,
              message_type: messageType,
              file_url: fileUrl,
              ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl, media_processed_at: new Date().toISOString() } : {}),
              ...(replyTo ? { reply_to: replyTo } : {}),
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
              removeLocalOutboxEntry(getDMOutboxScope(conversationId), clientMessageId);
              const message = {
                ...(finalData as DMMessage),
                optimistic: false,
                delivery_status: 'sent',
              } as DMMessage;
              setMessages(prev => upsertMessageIntoState(prev, message));
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
        upsertLocalOutboxEntry(getDMOutboxScope(conversationId), {
          id: clientMessageId,
          clientMessageId,
          senderId: user.id,
          content: trimmedContent,
          messageType,
          fileUrl,
          thumbnailUrl,
          replyTo,
          createdAt,
          failedAt: new Date().toISOString(),
        });
        setMessages(prev => markMessageSendFailed(prev, clientMessageId));
        await runRealtimeRecovery('send-error').catch(() => undefined);
        if (error instanceof Error) {
          (error as Error & { optimisticMessageId?: string }).optimisticMessageId = clientMessageId;
          throw error;
        }
        const wrappedError = new Error('Failed to send message') as Error & { optimisticMessageId?: string };
        wrappedError.optimisticMessageId = clientMessageId;
        throw wrappedError;
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    }, [user, conversationId, insertConversationMessage, profile]);

  const retryFailedMessage = useCallback(async (messageId: string) => {
    const failedMessage = latestMessagesRef.current.find(message =>
      (message.id === messageId || message.client_message_id === messageId) &&
      message.delivery_status === 'failed'
    );

    if (!failedMessage) return null;

    const clientMessageId = failedMessage.client_message_id || failedMessage.id;
    const retryContent = failedMessage.message_type === 'audio'
      ? failedMessage.audio_url || failedMessage.content
      : failedMessage.content;

    return sendMessage(
      retryContent,
      failedMessage.message_type,
      failedMessage.file_url,
      failedMessage.reply_to ?? undefined,
      failedMessage.thumbnail_url,
      {
        clientMessageId,
        createdAt: new Date().toISOString(),
      }
    );
  }, [sendMessage]);

  const discardFailedMessage = useCallback((messageId: string) => {
    if (!conversationId) return;

    removeLocalOutboxEntry(getDMOutboxScope(conversationId), messageId);
    setMessages(prev => prev.filter(message => (
      message.id !== messageId &&
      message.client_message_id !== messageId
    )));
  }, [conversationId]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!user || !conversationId || !content.trim()) return;

    const workingClient = await getWorkingClient();
    const editedAt = new Date().toISOString();
    const { error } = await workingClient
      .from('dm_messages')
      .update({ content: content.trim(), edited_at: editedAt })
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .eq('sender_id', user.id);

    if (error) throw error;

    setMessages(prev => prev.map(message => (
      message.id === messageId
        ? { ...message, content: content.trim(), edited_at: editedAt }
        : message
    )));
  }, [conversationId, user]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user || !conversationId) return;

    const workingClient = await getWorkingClient();
    const { error } = await workingClient
      .from('dm_messages')
      .delete()
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .eq('sender_id', user.id);

    if (error) throw error;

    setMessages(prev => prev.filter(message => message.id !== messageId));
  }, [conversationId, user]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user || !conversationId) return;

    const workingClient = await getWorkingClient();
    const { error } = await workingClient.rpc('toggle_message_reaction', {
      message_id: messageId,
      emoji,
      is_dm: true,
    });

    if (error) throw error;

    const message = await fetchConversationMessage(messageId);
    if (message && activeConversationIdRef.current === conversationId) {
      setMessages(prev => prev.map(existing => existing.id === message.id ? message : existing));
    }
  }, [conversationId, fetchConversationMessage, user]);

  return {
    messages,
    conversationId: loadedConversationId,
    loading,
    sending,
    loadingMore,
    hasMore,
    sendMessage,
    retryFailedMessage,
    discardFailedMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    loadOlderMessages,
    handleRealtimeInsert,
    handleRealtimeUpdate,
    refreshVisibleMessages,
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
