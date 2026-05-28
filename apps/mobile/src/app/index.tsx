import type { Session } from '@supabase/supabase-js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchCurrentProfile,
  fetchGeneralMessages,
  getDisplayName,
  sendGeneralTextMessage,
  subscribeToGeneralMessages,
  upsertGeneralMessage,
} from '@/lib/shadow-chat-api';
import { getSupabase, isSupabaseConfigured, removeRealtimeChannel } from '@/lib/supabase';
import type { GeneralChatMessage, ShadowUser } from '@/types/shadow-chat';

const colors = {
  background: '#050505',
  panel: '#101112',
  panelStrong: '#171717',
  panelSoft: '#0B0C0D',
  border: 'rgba(233, 199, 102, 0.18)',
  borderStrong: 'rgba(233, 199, 102, 0.38)',
  gold: '#E9C766',
  goldStrong: '#F7E7B2',
  text: '#F7F0DE',
  textMuted: '#A69B82',
  textDim: '#756B58',
  danger: '#F3A19D',
};

const formatMessageTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getMessageBody = (message: GeneralChatMessage) => {
  if (message.message_type === 'text' || message.message_type === 'command') {
    return message.content;
  }

  return `[${message.message_type}] ${message.content || message.file_url || ''}`.trim();
};

function ConfigurationNotice() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centeredPanel}>
        <Text style={styles.brand}>ShadowChat</Text>
        <Text selectable style={styles.errorText}>
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to
          apps/mobile/.env before starting the native app.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function SignInScreen({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.authShell}
      >
        <View style={styles.authCard}>
          <Text style={styles.brand}>ShadowChat</Text>
          <Text style={styles.authSubtitle}>Sign in with your existing web account.</Text>

          <View style={styles.form}>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!busy}
              inputMode="email"
              keyboardAppearance="dark"
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              textContentType="emailAddress"
              value={email}
            />
            <TextInput
              autoCapitalize="none"
              editable={!busy}
              keyboardAppearance="dark"
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              style={styles.input}
              textContentType="password"
              value={password}
            />

            {error && <Text selectable style={styles.errorText}>{error}</Text>}

            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={() => {
                void onSubmit(email, password);
              }}
              style={({ pressed }) => [
                styles.primaryButton,
                !canSubmit && styles.disabledButton,
                pressed && canSubmit && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageRow({
  currentUserId,
  message,
}: {
  currentUserId: string | null;
  message: GeneralChatMessage;
}) {
  const mine = message.user_id === currentUserId;
  const author = getDisplayName(message.user);

  return (
    <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowTheirs]}>
      <View style={[styles.messageBubble, mine ? styles.messageBubbleMine : styles.messageBubbleTheirs]}>
        <View style={styles.messageMeta}>
          <Text style={[styles.messageAuthor, mine && styles.messageAuthorMine]}>{author}</Text>
          <Text style={styles.messageTime}>{formatMessageTime(message.created_at)}</Text>
        </View>
        <Text selectable style={styles.messageText}>
          {getMessageBody(message)}
        </Text>
      </View>
    </View>
  );
}

export default function GeneralChatScreen() {
  const listRef = useRef<FlatList<GeneralChatMessage>>(null);
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ShadowUser | null>(null);
  const [messages, setMessages] = useState<GeneralChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentUserId = session?.user.id ?? null;
  const signedInName = useMemo(() => getDisplayName(profile), [profile]);

  const applySession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setError(null);

    if (!nextSession?.user) {
      setProfile(null);
      setMessages([]);
      return;
    }

    try {
      const nextProfile = await fetchCurrentProfile(nextSession.user.id);
      setProfile(nextProfile);
    } catch (err) {
      setProfile(null);
      setError(err instanceof Error ? err.message : 'Failed to load profile.');
    }
  }, []);

  const loadMessages = useCallback(async (showSpinner = true) => {
    if (!currentUserId) return;

    if (showSpinner) {
      setMessagesLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const nextMessages = await fetchGeneralMessages();
      setMessages(nextMessages);
      setError(null);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load General Chat.');
    } finally {
      setMessagesLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setInitialized(true);
      return;
    }

    const client = getSupabase();
    let mounted = true;

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) {
        setError(sessionError.message);
      }
      void applySession(data.session).finally(() => {
        if (mounted) setInitialized(true);
      });
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  useEffect(() => {
    if (currentUserId) {
      void loadMessages(true);
    }
  }, [currentUserId, loadMessages]);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = subscribeToGeneralMessages(
      message => {
        setMessages(previous => upsertGeneralMessage(previous, message));
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      },
      nextError => {
        setError(nextError.message);
      }
    );

    return () => removeRealtimeChannel(channel);
  }, [currentUserId]);

  const handleSignIn = useCallback(async (email: string, password: string) => {
    setAuthBusy(true);
    setError(null);
    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) throw signInError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setError(null);
    const { error: signOutError } = await getSupabase().auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || !currentUserId || sending) return;

    setSending(true);
    setDraft('');
    try {
      const sent = await sendGeneralTextMessage(currentUserId, content);
      setMessages(previous => upsertGeneralMessage(previous, sent));
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      setError(null);
    } catch (err) {
      setDraft(content);
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSending(false);
    }
  }, [currentUserId, draft, sending]);

  if (!isSupabaseConfigured) {
    return <ConfigurationNotice />;
  }

  if (!initialized) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredPanel}>
          <ActivityIndicator color={colors.gold} />
          <Text style={styles.loadingText}>Opening ShadowChat</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <SignInScreen busy={authBusy} error={error} onSubmit={handleSignIn} />;
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
        style={styles.chatShell}
      >
        <View style={styles.chatHeader}>
          <View>
            <Text style={styles.headerEyebrow}>General Chat</Text>
            <Text style={styles.headerTitle}>{signedInName}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void handleSignOut();
            }}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>Sign Out</Text>
          </Pressable>
        </View>

        {error && (
          <Text selectable style={styles.inlineError}>
            {error}
          </Text>
        )}

        <FlatList
          ref={listRef}
          contentContainerStyle={styles.messageList}
          contentInsetAdjustmentBehavior="automatic"
          data={messages}
          keyExtractor={item => item.id}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              {messagesLoading ? (
                <ActivityIndicator color={colors.gold} />
              ) : (
                <Text style={styles.emptyText}>No General Chat messages loaded yet.</Text>
              )}
            </View>
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.gold}
              onRefresh={() => {
                void loadMessages(false);
              }}
            />
          }
          renderItem={({ item }) => <MessageRow currentUserId={currentUserId} message={item} />}
        />

        <View style={styles.composer}>
          <TextInput
            editable={!sending}
            keyboardAppearance="dark"
            multiline
            onChangeText={setDraft}
            onSubmitEditing={() => {
              void handleSend();
            }}
            placeholder="Message General Chat"
            placeholderTextColor={colors.textDim}
            returnKeyType="send"
            style={styles.composerInput}
            value={draft}
          />
          <Pressable
            accessibilityRole="button"
            disabled={draft.trim().length === 0 || sending}
            onPress={() => {
              void handleSend();
            }}
            style={({ pressed }) => [
              styles.sendButton,
              (draft.trim().length === 0 || sending) && styles.disabledButton,
              pressed && draft.trim().length > 0 && !sending && styles.pressed,
            ]}
          >
            {sending ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centeredPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  brand: {
    color: colors.goldStrong,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
  },
  authShell: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  authCard: {
    gap: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    borderRadius: 24,
    padding: 22,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.42)',
  },
  authSubtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  form: {
    gap: 12,
  },
  input: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.gold,
  },
  primaryButtonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: colors.goldStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.46,
  },
  pressed: {
    opacity: 0.72,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  chatShell: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerEyebrow: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  inlineError: {
    marginHorizontal: 16,
    marginTop: 10,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  messageList: {
    flexGrow: 1,
    gap: 10,
    padding: 16,
  },
  messageRow: {
    flexDirection: 'row',
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowTheirs: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '84%',
    gap: 6,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  messageBubbleMine: {
    borderColor: colors.borderStrong,
    backgroundColor: '#2A2312',
  },
  messageBubbleTheirs: {
    borderColor: colors.border,
    backgroundColor: colors.panelStrong,
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageAuthor: {
    flexShrink: 1,
    color: colors.gold,
    fontSize: 12,
    fontWeight: '800',
  },
  messageAuthorMine: {
    color: colors.goldStrong,
  },
  messageTime: {
    color: colors.textDim,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  messageText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  emptyState: {
    flexGrow: 1,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 10,
  },
  composerInput: {
    maxHeight: 120,
    minHeight: 46,
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  sendButton: {
    minHeight: 46,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.gold,
    paddingHorizontal: 16,
  },
  sendButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '900',
  },
});
