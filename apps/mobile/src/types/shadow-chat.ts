export type ChatMessageType = 'text' | 'command' | 'audio' | 'image' | 'video' | 'file';

export type ShadowUser = {
  id: string;
  email?: string | null;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_thumbnail_url?: string | null;
  color?: string | null;
  admin_role?: string | null;
};

export type GeneralChatMessage = {
  id: string;
  client_message_id?: string | null;
  user_id: string;
  content: string;
  message_type: ChatMessageType;
  audio_url?: string | null;
  file_url?: string | null;
  thumbnail_url?: string | null;
  media_processed_at?: string | null;
  reply_to?: string | null;
  reactions?: Record<string, string[]> | null;
  pinned?: boolean | null;
  created_at: string;
  updated_at?: string | null;
  user?: ShadowUser | null;
};
