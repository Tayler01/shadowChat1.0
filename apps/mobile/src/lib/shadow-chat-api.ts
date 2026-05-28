import type { RealtimeChannel } from '@supabase/supabase-js';

import { getSupabase } from './supabase';
import type { GeneralChatMessage, ShadowUser } from '@/types/shadow-chat';

const GENERAL_MESSAGE_SELECT = `
  id,
  client_message_id,
  user_id,
  content,
  message_type,
  audio_url,
  file_url,
  thumbnail_url,
  media_processed_at,
  reply_to,
  reactions,
  pinned,
  created_at,
  updated_at,
  user:users!user_id(
    id,
    email,
    username,
    display_name,
    avatar_url,
    avatar_thumbnail_url,
    color,
    admin_role
  )
`;

const PROFILE_SELECT = `
  id,
  email,
  username,
  display_name,
  avatar_url,
  avatar_thumbnail_url,
  color,
  admin_role
`;

const MESSAGE_WINDOW = 50;

const sortByCreatedAt = (items: GeneralChatMessage[]) =>
  [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

const normalizeJoinedUser = (value: unknown): ShadowUser | null => {
  if (Array.isArray(value)) {
    return (value[0] as ShadowUser | undefined) ?? null;
  }

  return (value as ShadowUser | null | undefined) ?? null;
};

const normalizeGeneralMessage = (value: unknown): GeneralChatMessage => {
  const message = value as GeneralChatMessage & {
    user?: ShadowUser | ShadowUser[] | null;
  };

  return {
    ...message,
    user: normalizeJoinedUser(message.user),
  };
};

const isClientMessageIdSchemaError = (error: unknown) => {
  const issue = error as { message?: string; details?: string; hint?: string; code?: string };
  const haystack = `${issue?.message ?? ''} ${issue?.details ?? ''} ${issue?.hint ?? ''} ${
    issue?.code ?? ''
  }`;

  return haystack.includes('client_message_id');
};

export const getDisplayName = (user?: ShadowUser | null) =>
  user?.display_name?.trim() || user?.username?.trim() || 'ShadowChat user';

export const createClientMessageId = (userId: string) =>
  `native:${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

export const upsertGeneralMessage = (
  messages: GeneralChatMessage[],
  incoming: GeneralChatMessage
) => {
  const existingIndex = messages.findIndex(
    message =>
      message.id === incoming.id ||
      (Boolean(message.client_message_id) &&
        message.client_message_id === incoming.client_message_id)
  );

  if (existingIndex >= 0) {
    const next = [...messages];
    next[existingIndex] = {
      ...next[existingIndex],
      ...incoming,
      user: incoming.user ?? next[existingIndex].user,
    };
    return sortByCreatedAt(next).slice(-MESSAGE_WINDOW);
  }

  return sortByCreatedAt([...messages, incoming]).slice(-MESSAGE_WINDOW);
};

export const fetchCurrentProfile = async (userId: string) => {
  const { data, error } = await getSupabase()
    .from('users')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as ShadowUser | null;
};

export const fetchGeneralMessages = async () => {
  const { data, error } = await getSupabase()
    .from('messages')
    .select(GENERAL_MESSAGE_SELECT)
    .order('created_at', { ascending: false })
    .limit(MESSAGE_WINDOW);

  if (error) throw error;
  return sortByCreatedAt((data ?? []).map(normalizeGeneralMessage));
};

export const fetchGeneralMessageById = async (messageId: string) => {
  const { data, error } = await getSupabase()
    .from('messages')
    .select(GENERAL_MESSAGE_SELECT)
    .eq('id', messageId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeGeneralMessage(data) : null;
};

export const sendGeneralTextMessage = async (
  userId: string,
  content: string,
  clientMessageId = createClientMessageId(userId)
) => {
  const payload = {
    user_id: userId,
    client_message_id: clientMessageId,
    content: content.trim(),
    message_type: 'text',
  };

  let result = await getSupabase()
    .from('messages')
    .insert(payload)
    .select(GENERAL_MESSAGE_SELECT)
    .single();

  if (result.error && isClientMessageIdSchemaError(result.error)) {
    result = await getSupabase()
      .from('messages')
      .insert({
        user_id: userId,
        content: payload.content,
        message_type: payload.message_type,
      })
      .select(GENERAL_MESSAGE_SELECT)
      .single();
  }

  if (result.error) throw result.error;
  return normalizeGeneralMessage(result.data);
};

export const subscribeToGeneralMessages = (
  onMessage: (message: GeneralChatMessage) => void,
  onError: (error: Error) => void
): RealtimeChannel => {
  const channel = getSupabase()
    .channel(`native-general-chat:${Date.now()}:${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      payload => {
        const id = payload.new?.id;
        if (typeof id !== 'string') return;

        void fetchGeneralMessageById(id)
          .then(message => {
            if (message) onMessage(message);
          })
          .catch(error => {
            onError(error instanceof Error ? error : new Error('Realtime hydration failed.'));
          });
      }
    )
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR') {
        onError(new Error('General Chat realtime channel failed.'));
      }
    });

  return channel;
};
