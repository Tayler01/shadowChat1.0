/* eslint-disable react-refresh/only-export-components */
import React, {
  useEffect,
  useState,
  useCallback,
  useRef
} from 'react';
import {
  Message,
  type ChatMessageType,
  ensureSession,
  refreshSessionLocked,
  getRealtimeClient,
  getWorkingClient,
  withTimeout,
} from '../lib/supabase';
import { runRealtimeRecovery } from '../lib/realtimeRecovery';
import { triggerGroupPushNotification } from '../lib/push';
import {
  createClientMessageId,
  findMatchingMessageIndex,
  isClientMessageIdSchemaError,
  isMediaThumbnailSchemaError,
  markMessageSendFailed,
  mergeRealtimeMessageUpdate,
  upsertMessageIntoState,
} from '../lib/optimisticMessages';
import { MESSAGE_FETCH_LIMIT } from '../config';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  MessagesContext,
  type MessagesContextValue,
  useMessages,
  useOptionalMessages,
} from './MessagesContext';
import { useAuth } from './useAuth';
import { useRealtimeRecovery } from './useRealtimeRecovery';
import { useSoundEffects } from './useSoundEffects';
import { createRealtimeChannelName } from '../lib/realtimeChannelName';

export { useMessages, useOptionalMessages };

const SEND_OPERATION_TIMEOUT_MS = 12000;

const dedupeMessagesById = (items: Message[]) =>
  items.reduce<Message[]>((acc, item) => upsertMessageIntoState(acc, item), [])

const sortMessagesByCreatedAt = (items: Message[]) =>
  [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

const trimMessageWindow = (items: Message[]) => {
  const deduped = dedupeMessagesById(items)
  const pinned = deduped.filter(message => message.pinned)
  const regular = deduped.filter(message => !message.pinned)

  return sortMessagesByCreatedAt([
    ...pinned,
    ...sortMessagesByCreatedAt(regular).slice(-MESSAGE_FETCH_LIMIT),
  ])
}

const cacheMessages = (items: Message[]) => {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    const cacheableMessages = items.filter(
      message => !message.optimistic && message.delivery_status !== 'sending' && message.delivery_status !== 'failed'
    )
    localStorage.setItem('chatHistory', JSON.stringify(trimMessageWindow(cacheableMessages)))
  } catch {
    // ignore storage errors
  }
}

// --- Helper functions extracted from sendMessage workflow ---
export const prepareMessageData = (
  userId: string,
  content: string,
  messageType: ChatMessageType,
  fileUrl?: string,
  replyTo?: string,
  clientMessageId?: string,
  thumbnailUrl?: string | null
) => ({
  user_id: userId,
  ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
  content: messageType === 'audio' ? '' : content.trim(),
  message_type: messageType,
  file_url: fileUrl,
  ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl, media_processed_at: new Date().toISOString() } : {}),
  ...(replyTo ? { reply_to: replyTo } : {}),
  ...(messageType === 'audio' ? { audio_url: content.trim() } : {}),
});

export const insertMessage = async (messageData: {
  user_id: string;
  content: string;
  message_type: ChatMessageType;
  client_message_id?: string;
  file_url?: string;
  thumbnail_url?: string;
  media_processed_at?: string;
  audio_url?: string;
  reply_to?: string;
}) => {
  const workingClient = await getWorkingClient();
  const insertPromise = workingClient
    .from('messages')
    .insert(messageData)
    .select(`
      *,
      user:users!user_id(*)
    `)
    .single();

  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('Database insert timeout after 10 seconds')),
      10000
    )
  );

  let result = (await Promise.race([insertPromise, timeout])) as any;

  if (result.error && isMediaThumbnailSchemaError(result.error)) {
    const {
      thumbnail_url: _thumbnailUrl,
      media_processed_at: _mediaProcessedAt,
      ...legacyMediaMessageData
    } = messageData;
    const legacyMediaInsertPromise = workingClient
      .from('messages')
      .insert(legacyMediaMessageData)
      .select(`
        *,
        user:users!user_id(*)
      `)
      .single();

    result = (await Promise.race([legacyMediaInsertPromise, timeout])) as any;
  }

  if (result.error && messageData.client_message_id && isClientMessageIdSchemaError(result.error)) {
    const {
      client_message_id: _clientMessageId,
      thumbnail_url: _thumbnailUrl,
      media_processed_at: _mediaProcessedAt,
      ...legacyMessageData
    } = messageData;
    const legacyInsertPromise = workingClient
      .from('messages')
      .insert(legacyMessageData)
      .select(`
        *,
        user:users!user_id(*)
      `)
      .single();

    result = (await Promise.race([legacyInsertPromise, timeout])) as any;
  }

  if (
    result.error &&
    messageData.client_message_id &&
    (result.error.code === '23505' || result.error.status === 409)
  ) {
    result = await workingClient
      .from('messages')
      .select(`
        *,
        user:users!user_id(*)
      `)
      .eq('user_id', messageData.user_id)
      .eq('client_message_id', messageData.client_message_id)
      .maybeSingle();
  }

  return result as { data: Message | null; error: any };
};

export const refreshSessionAndRetry = async (messageData: {
  user_id: string;
  content: string;
  message_type: ChatMessageType;
  client_message_id?: string;
  file_url?: string;
  thumbnail_url?: string;
  media_processed_at?: string;
  audio_url?: string;
  reply_to?: string;
}) => {
  const refreshPromise = refreshSessionLocked();
  const refreshTimeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error('Session refresh timeout after 5 seconds')),
      5000
    )
  );

  const { data: refreshData, error: refreshError } = (await Promise.race([
    refreshPromise,
    refreshTimeout,
  ])) as any;

  if (!refreshError && refreshData.session) {
    return insertMessage(messageData);
  }

  return { data: null, error: refreshError } as {
    data: Message | null;
    error: any;
  };
};

function useProvideMessages(): MessagesContextValue {
  const initialMessages = (() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('chatHistory');
        if (stored) {
          return trimMessageWindow(JSON.parse(stored) as Message[]);
        }
      } catch {
        // ignore parse errors
      }
    }
    return [] as Message[];
  })();

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [loading, setLoading] = useState(initialMessages.length === 0);
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const { user, profile } = useAuth();
  const { playMessage, playReaction } = useSoundEffects();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribeRef = useRef<() => Promise<RealtimeChannel>>();
  const clientResetRef = useRef<() => Promise<void>>();
  const resetInFlightRef = useRef<Promise<void> | null>(null);
  const fetchRequestIdRef = useRef(0);
  const loadedOlderRef = useRef(false);
  const sendingRef = useRef(false);
  const latestMessagesRef = useRef<Message[]>(initialMessages);
  const hydrationFetchesRef = useRef<Map<string, Promise<Message | null>>>(new Map());

  const addNewMessage = useCallback(
    (msg: Message) => {
      let added = false;
      setMessages(prev => {
        const exists = findMatchingMessageIndex(prev, msg) >= 0;
        const nextMessages = upsertMessageIntoState(prev, {
          ...msg,
          optimistic: false,
          delivery_status: 'sent',
        });
        if (nextMessages === prev) return prev;
        added = !exists;
        return loadedOlderRef.current ? sortMessagesByCreatedAt(nextMessages) : trimMessageWindow(nextMessages);
      });
      if (added && user && msg.user_id !== user.id) {
        playMessage();
      }
    },
    [playMessage, user]
  );

  const fetchMessages = useCallback(async () => {
    const requestId = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = requestId;

    try {
      const workingClient = await getWorkingClient();
      const [pinnedRes, messagesRes] = await Promise.all([
        workingClient
          .from('messages')
          .select(
            `
          *,
          user:users!user_id(*)
        `,
          )
          .eq('pinned', true)
          .order('pinned_at', { ascending: true }),
        workingClient
          .from('messages')
          .select(
            `
          *,
          user:users!user_id(*)
        `,
          )
          .order('created_at', { ascending: false })
          .limit(MESSAGE_FETCH_LIMIT),
      ]);

      const pinnedMessages = (pinnedRes.data || []) as unknown as Message[];
      const fetchedMessages = ((messagesRes.data || []) as unknown as Message[]).reverse();
      const data = dedupeMessagesById([...pinnedMessages, ...fetchedMessages]);
      const error = pinnedRes.error || messagesRes.error;

      if (requestId !== fetchRequestIdRef.current) {
        return;
      }

      setHasMore((messagesRes.data?.length || 0) === MESSAGE_FETCH_LIMIT);

      if (error) {
        throw error;
      } else if (data.length > 0) {
        const pinnedIds = new Set(pinnedMessages.map(m => m.id));

        setMessages(prev => {
          if (prev.length === 0 || !loadedOlderRef.current) {
            const pendingLocalMessages = prev.filter(
              message => message.optimistic || message.delivery_status === 'sending' || message.delivery_status === 'failed'
            );
            const mergedMessages = [...data as unknown as Message[]].reduce<Message[]>(
              (acc, message) => upsertMessageIntoState(acc, { ...message, optimistic: false, delivery_status: 'sent' }),
              pendingLocalMessages
            );
            const nextMessages = trimMessageWindow(mergedMessages);
            cacheMessages(nextMessages);
            return nextMessages;
          }

          const fetchedById = new Map(data.map(message => [message.id, message as unknown as Message]));
          const mergedMap = new Map<string, Message>();

          // Replace or update existing messages
          prev.forEach(m => {
            const fetched = fetchedById.get(m.id);
            let updated = m;

            if (fetched) {
              updated = fetched;
            } else if (m.pinned && !pinnedIds.has(m.id)) {
              updated = { ...m, pinned: false, pinned_by: null, pinned_at: null } as Message;
            }

            mergedMap.set(updated.id, updated);
          });

          // Add new messages
          const mergedMessages = data.reduce<Message[]>(
            (acc, d) => upsertMessageIntoState(acc, {
              ...(d as unknown as Message),
              optimistic: false,
              delivery_status: 'sent',
            }),
            Array.from(mergedMap.values())
          );

          const nextMessages = sortMessagesByCreatedAt(mergedMessages);
          cacheMessages(nextMessages);
          return nextMessages;
        });
      } else {
        setMessages([]);
        setHasMore(false);
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.removeItem('chatHistory');
          } catch {
            // ignore storage errors
          }
        }
      }
    } catch (error) {
      throw error;
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const hydrateMessage = useCallback((messageId: string) => {
    const existing = hydrationFetchesRef.current.get(messageId);
    if (existing) return existing;

    const request = getWorkingClient()
      .then(workingClient =>
        workingClient
          .from('messages')
          .select(`
            *,
            user:users!user_id(*)
          `)
          .eq('id', messageId)
          .maybeSingle()
      )
      .then(({ data, error }) => (error || !data ? null : data as unknown as Message))
      .catch(() => null)
      .finally(() => {
        hydrationFetchesRef.current.delete(messageId);
      });

    hydrationFetchesRef.current.set(messageId, request);
    return request;
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const oldest = messages.find(m => !m.pinned)?.created_at;
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const workingClient = await getWorkingClient();
      const { data, error } = await workingClient
        .from('messages')
        .select(
          `
        *,
        user:users!user_id(*)
      `,
        )
        .lt('created_at', oldest)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_FETCH_LIMIT);

      if (error) throw error;

      if (data && data.length > 0) {
        const newMessages = (data as unknown as Message[]).reverse();
        loadedOlderRef.current = true;
        setMessages(prev => {
          const pinned = prev.filter(m => m.pinned);
          const rest = prev.filter(m => !m.pinned);
          return sortMessagesByCreatedAt(dedupeMessagesById([...pinned, ...newMessages, ...rest]));
        });
        setHasMore(data.length === MESSAGE_FETCH_LIMIT);
      } else {
        setHasMore(false);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [messages, loadingMore, hasMore]);

  // Reset function to reinitialize everything with fresh client
  const resetWithFreshClient = useCallback(async () => {
    if (resetInFlightRef.current) {
      return resetInFlightRef.current;
    }

    resetInFlightRef.current = (async () => {
      try {
        // Clean up old channel
        if (channelRef.current) {
          try {
            const workingClient = await getWorkingClient();
            if (workingClient && workingClient.removeChannel && typeof workingClient.removeChannel === 'function') {
              await workingClient.removeChannel(channelRef.current);
            }
          } catch {
            // Ignore cleanup failures; the next subscribe call uses a fresh topic.
          }
          channelRef.current = null;
        }

        // Refetch messages with new client
        await fetchMessages().catch(() => undefined);

        // Resubscribe to realtime with new client
        if (subscribeRef.current) {
          try {
            const newChannel = await subscribeRef.current();
            channelRef.current = newChannel;
          } catch {
            // The next recovery/focus event will try again.
          }
        }

      } catch {
        await fetchMessages().catch(() => undefined);
      } finally {
        resetInFlightRef.current = null;
      }
    })();

    return resetInFlightRef.current;
  }, [fetchMessages]);

  const handleVisible = useCallback(() => {
    const channel = channelRef.current;
    if (channel && channel.state === 'joined') {
      void fetchMessages().catch(() => undefined);
      return;
    }

    if (clientResetRef.current) {
      void clientResetRef.current().catch(() => {
        void fetchMessages().catch(() => undefined);
      });
    } else {
      void fetchMessages().catch(() => undefined);
    }
  }, [fetchMessages]);

  useRealtimeRecovery(handleVisible);

  // Fetch initial messages
  useEffect(() => {
    void fetchMessages().catch(() => undefined);
    
    // Store the reset function for visibility refresh
    clientResetRef.current = resetWithFreshClient;
    
  }, [fetchMessages, resetWithFreshClient]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    latestMessagesRef.current = messages;
    cacheMessages(messages);
  }, [messages]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) {
      return;
    }

    let channel: RealtimeChannel | null = null;
    let currentClient: any = null;
    let disposed = false;

    const subscribeToChannel = async (): Promise<RealtimeChannel> => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient());
      currentClient = currentClient || getRealtimeClient();
      
      if (!currentClient?.channel || typeof currentClient.channel !== 'function') {
        throw new Error('Realtime client unavailable');
      }
      
      // Supabase reuses channels by topic, so each resubscribe gets a fresh topic.
      const newChannel = currentClient.channel(createRealtimeChannelName(`public:messages:${user.id}`), {
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
          table: 'messages'
        },
        async (payload: any) => {
          try {
            const alreadyHydrated = latestMessagesRef.current.some(message =>
              message.id === payload.new.id && !message.optimistic && Boolean(message.user)
            );
            if (alreadyHydrated) {
              return;
            }

            const newMessage = await hydrateMessage(payload.new.id);
            if (disposed) return;

            if (newMessage) {
              addNewMessage(newMessage as unknown as Message)
            }
          } catch {
            // ignore realtime fetch errors and wait for the next refresh
          }
        })
        .on('broadcast', { event: 'new_message' }, (payload: any) => {
          const newMessage = payload.payload as Message;

          addNewMessage(newMessage as Message)
        })
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages'
          },
          (payload: any) => {
            const incoming = payload.new as Partial<Message>
            if (!incoming?.id || disposed) return

            setMessages(prev => {
              const index = prev.findIndex(msg => msg.id === incoming.id)
              if (index === -1) return prev

              const prevMessage = prev[index]
              const merged = mergeRealtimeMessageUpdate(prevMessage, incoming, { user: prevMessage.user })
              if (!merged) return prev

              const changed =
                JSON.stringify(prevMessage.reactions) !== JSON.stringify(merged.reactions)
              const newList = prev.map(msg =>
                msg.id === merged.id ? (merged as unknown as Message) : msg
              )
              if (changed) {
                const prevUsers = (prevMessage.reactions || {}) as Record<string, { users?: string[] }>
                const currUsers = (merged.reactions || {}) as Record<string, { users?: string[] }>
                const changedByCurrent = Object.keys({ ...prevUsers, ...currUsers }).some(e => {
                  const before = prevUsers[e]?.users || []
                  const after = currUsers[e]?.users || []
                  const beforeHas = before.includes(user.id)
                  const afterHas = after.includes(user.id)
                  return beforeHas !== afterHas
                })
                if (!changedByCurrent) {
                  playReaction()
                }
              }
              return newList
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'messages'
          },
          (payload: any) => {
            setMessages(prev =>
              prev.filter(msg => msg.id !== payload.old.id)
            );
          }
        )
        .subscribe(async (status: string, err: any) => {
          if (err) {
            // Handle specific binding mismatch error
            if (err.message && err.message.includes('mismatch between server and client bindings for postgres changes')) {
              try {
                await runRealtimeRecovery('channel-error');
                
                // Use the comprehensive reset function
                if (clientResetRef.current) {
                  await clientResetRef.current();
                }
              } catch (resetError) {
                // Fallback to simple resubscription after delay
                setTimeout(() => {
                  void subscribeToChannel().then(newCh => {
                    channel = newCh;
                    channelRef.current = newCh;
                  }).catch(() => undefined);
                }, 2000);
              }
              return;
            }
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            try {
              await runRealtimeRecovery('channel-error');
              
              // Use the comprehensive reset function
              if (clientResetRef.current) {
                await clientResetRef.current();
              }
            } catch (resetError) {
              // Fallback to simple resubscription after delay
              setTimeout(() => {
                void subscribeToChannel().then(newCh => {
                  channel = newCh;
                  channelRef.current = newCh;
                }).catch(() => undefined);
              }, 2000);
            }
          } else if (status === 'CLOSED') {
            setTimeout(() => {
              void subscribeToChannel().then(newCh => {
                channel = newCh;
                channelRef.current = newCh;
              }).catch(() => undefined);
            }, 1000);
          }
        });

      return newChannel;
    };

    subscribeToChannel()
      .then(newChannel => {
        channel = newChannel;
        channelRef.current = newChannel;
      })
      .catch(() => {});
    subscribeRef.current = subscribeToChannel;

    return () => {
      disposed = true;
      if (channel && currentClient && currentClient.removeChannel && typeof currentClient.removeChannel === 'function') {
        currentClient.removeChannel(channel);
      } else if (channel && getRealtimeClient()?.removeChannel) {
        getRealtimeClient()?.removeChannel(channel);
      }
      channelRef.current = null;
    };
  }, [addNewMessage, hydrateMessage, playReaction, user]);

  const sendMessage = useCallback(async (
    content: string,
    messageType: ChatMessageType = 'text',
    fileUrl?: string,
    replyTo?: string,
    thumbnailUrl?: string | null
  ): Promise<Message | null> => {
    // Text messages require content, but image/audio messages may provide just a file URL
    if (!user || (!content.trim() && !fileUrl)) {
      return null;
    }

    if (sendingRef.current) {
      return null;
    }

    sendingRef.current = true;
    setSending(true);
    let inserted: Message | null = null;
    const clientMessageId = createClientMessageId();
    const createdAt = new Date().toISOString();
    const optimisticPayload = prepareMessageData(
      user.id,
      content,
      messageType,
      fileUrl,
      replyTo,
      clientMessageId,
      thumbnailUrl
    );

    setMessages(prev => {
      const nextMessages = upsertMessageIntoState(prev, {
        id: clientMessageId,
        ...optimisticPayload,
        reactions: {},
        pinned: false,
        pinned_by: null,
        pinned_at: null,
        created_at: createdAt,
        updated_at: createdAt,
        user: profile ?? user,
        optimistic: true,
        delivery_status: 'sending',
      } as Message);
      return loadedOlderRef.current ? sortMessagesByCreatedAt(nextMessages) : trimMessageWindow(nextMessages);
    });

    const executeSend = async () => {
      // Ensure we have a valid session before attempting database operations
      const sessionValid = await ensureSession();
      if (!sessionValid) {
        throw new Error('Authentication session is invalid or expired. Please refresh the page and try again.');
      }

      const messageData = prepareMessageData(
        user.id,
        content,
        messageType,
        fileUrl,
        replyTo,
        clientMessageId,
        thumbnailUrl
      );

      const attemptSend = async () => {
        let { data, error } = await insertMessage(messageData);

        if (error && (error.status === 401 || /jwt|token|expired/i.test(error.message))) {
          const retry = await refreshSessionAndRetry(messageData);
          data = retry.data;
          error = retry.error;
        }

        if (error) {
          throw error;
        }

        if (data) {
          inserted = {
            ...(data as unknown as Message),
            optimistic: false,
            delivery_status: 'sent',
          };

          addNewMessage(inserted);

          if (data.id) {
            triggerGroupPushNotification(data.id).catch(() => {
              // Push delivery should never block the visible send path.
            });
          }

          if (channelRef.current?.state === 'joined') {
            channelRef.current.send({
              type: 'broadcast',
              event: 'new_message',
              payload: data,
            });
          }
        }
      };

      let lastError: any = null;
      for (let i = 0; i < 3; i++) {
        try {
          await attemptSend();
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          if (i < 2) {
            await new Promise(res => setTimeout(res, 300));
          }
        }
      }

      if (lastError) {
        throw lastError;
      }
    };

    try {
      await withTimeout(
        executeSend(),
        SEND_OPERATION_TIMEOUT_MS,
        'Message send timed out while reconnecting. Please try again.'
      );
    } catch (error) {
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
    return inserted;
  }, [addNewMessage, profile, user]);

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (!user) return;

    try {
      const workingClient = await getWorkingClient();
      
      const { error } = await workingClient
        .from('messages')
        .update({
          content,
          edited_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      // Optimistically update local state
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, content, edited_at: new Date().toISOString() } as Message : m
        )
      );

    } catch (error) {
      throw error;
    }
  }, [user]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!user) return;

    try {
      const workingClient = await getWorkingClient();
      
      const { data, error } = await workingClient
        .from('messages')
        .delete()
        .eq('id', messageId)
        .select('id')
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error('Message delete was not confirmed by the server.');
      }

      // Optimistically remove from local state
      setMessages(prev => prev.filter(m => m.id !== messageId));

    } catch (error) {
      throw error;
    }
  }, [user]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;

    // Optimistically update local state so the reaction appears immediately
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === messageId);
      if (idx === -1) return prev;

      const message = prev[idx];
      const reactions = { ...(message.reactions || {}) } as Record<string, { count: number; users: string[] }>;
      let data = reactions[emoji] || { count: 0, users: [] as string[] };
      const reacted = data.users.includes(user.id);

      if (reacted) {
        data = {
          count: data.count - 1,
          users: data.users.filter(u => u !== user.id),
        };
        if (data.count <= 0) {
          delete reactions[emoji];
        } else {
          reactions[emoji] = data;
        }
      } else {
        data = {
          count: data.count + 1,
          users: [...data.users, user.id],
        };
        reactions[emoji] = data;
      }

      const updated = { ...message, reactions };
      const newMessages = [...prev];
      newMessages[idx] = updated as Message;
      return newMessages;
    });

    try {
      const workingClient = await getWorkingClient();
      
      const { error } = await workingClient.rpc('toggle_message_reaction', {
        message_id: messageId,
        emoji: emoji,
        is_dm: false,
      });

      if (error) {
        throw error;
      }
      
    } catch (error) {
      throw error;
    }
  }, [user]);

  const togglePin = useCallback(async (messageId: string) => {
    if (!user) return;

    try {
      const workingClient = await getWorkingClient();
      
      const { error } = await workingClient.rpc('toggle_message_pin', {
        message_id: messageId,
      });

      if (error) {
        throw error;
      }

      setMessages(prev => {
        const current = prev.find(m => m.id === messageId);
        const isPinned = current?.pinned;

        return prev.map(m => {
          if (m.id === messageId) {
            return {
              ...m,
              pinned: !isPinned,
              pinned_by: !isPinned ? user.id : null,
              pinned_at: !isPinned ? new Date().toISOString() : null,
            };
          }
          return !isPinned
            ? { ...m, pinned: false, pinned_by: null, pinned_at: null }
            : m;
        });
      });
      
    } catch (error) {
      // Re-sync with database to revert optimistic updates
      fetchMessages();
      throw error;
    }
  }, [fetchMessages, user]);

  return {
    messages,
    loading,
    sending,
    loadingMore,
    hasMore,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
    togglePin,
    loadOlderMessages,
  };
}

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideMessages();
  return (
    <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>
  );
}
