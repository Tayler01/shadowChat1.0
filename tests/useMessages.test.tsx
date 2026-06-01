import { renderHook, act, waitFor } from '@testing-library/react';
import {
  MessagesProvider,
  useMessages,
  prepareMessageData,
  insertMessage,
  refreshSessionAndRetry,
} from '../src/hooks/useMessages';
import * as messagesModule from '../src/hooks/useMessages';
import { useAuth } from '../src/hooks/useAuth';
import {
  supabase,
  ensureSession,
  fetchGeneralChatMessageWindow,
  getWorkingClient,
  getRealtimeClient,
  isGeneralChatMessageWindowRpcUnavailable,
  refreshSessionLocked,
} from '../src/lib/supabase';
import type { Message } from '../src/lib/supabase';
import { runRealtimeRecovery } from '../src/lib/realtimeRecovery';

jest.mock('../src/hooks/useAuth');
jest.mock('../src/hooks/useRealtimeRecovery', () => ({
  useRealtimeRecovery: jest.fn(),
}));
jest.mock('../src/hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({ playMessage: jest.fn(), playReaction: jest.fn() }),
}));
jest.mock('../src/lib/push', () => ({
  triggerGroupPushNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/lib/realtimeRecovery', () => ({
  runRealtimeRecovery: jest.fn().mockResolvedValue({ ok: true, skipped: false, reason: 'channel-error' }),
}));
jest.mock('../src/config', () => ({
  MESSAGE_FETCH_LIMIT: 40,
}));
jest.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      from: jest.fn(),
      channel: jest.fn(),
      removeChannel: jest.fn(),
      rpc: jest.fn(),
      auth: { getSession: jest.fn(), refreshSession: jest.fn() },
    },
    getWorkingClient: jest.fn(),
    getRealtimeClient: jest.fn(),
    fetchGeneralChatMessageWindow: jest.fn(),
    isGeneralChatMessageWindowRpcUnavailable: jest.fn(),
    refreshSessionLocked: jest.fn(),
    ensureSession: jest.fn(),
    withTimeout: jest.fn((promise: Promise<unknown>) => promise),
  };
});

type SupabaseMock = jest.Mocked<typeof supabase>;
type WorkingClient = {
  from: jest.Mock;
  channel: jest.Mock;
  removeChannel: jest.Mock;
  rpc: jest.Mock;
  auth: {
    getSession: jest.Mock;
    refreshSession: jest.Mock;
  };
};

const createQuery = (overrides: Record<string, unknown> = {}) => {
  const query: Record<string, any> = {
    insert: jest.fn(() => query),
    select: jest.fn(() => query),
    single: jest.fn().mockResolvedValue({ data: [], error: null }),
    order: jest.fn(() => query),
    or: jest.fn(() => query),
    lt: jest.fn(() => query),
    gt: jest.fn(() => query),
    limit: jest.fn(() => query),
    update: jest.fn(() => query),
    delete: jest.fn(() => query),
    eq: jest.fn(() => query),
    maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'm1' }, error: null }),
    rpc: jest.fn(() => query),
  };

  Object.assign(query, overrides);
  return query;
};

const createThenableQuery = (
  result: { data: unknown; error: unknown },
  overrides: Record<string, unknown> = {}
) => {
  const query = createQuery(overrides);
  query.then = (onFulfilled: (value: typeof result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  query.catch = (onRejected: (reason: unknown) => unknown) =>
    Promise.resolve(result).catch(onRejected);
  query.finally = (onFinally: () => void) =>
    Promise.resolve(result).finally(onFinally);
  return query;
};

const makeDbMessage = (id: string, createdAt: string, pinned = false) => ({
  id,
  user_id: 'u1',
  content: `Message ${id}`,
  message_type: 'text',
  reactions: {},
  pinned,
  pinned_by: null,
  pinned_at: pinned ? createdAt : null,
  created_at: createdAt,
  updated_at: createdAt,
  user: { id: 'u1', username: 'alice', display_name: 'Alice' },
}) as unknown as Message;

const makeLatestWindow = () => {
  const timestamp = '2026-05-03T12:00:00.000Z';
  return Array.from({ length: 40 }, (_, index) =>
    makeDbMessage(`m${String(index).padStart(2, '0')}`, timestamp)
  );
};

let workingClient: WorkingClient;

const configureWorkingClient = () => {
  workingClient = {
    from: jest.fn(() => createQuery()),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
      send: jest.fn(),
      state: 'joined',
    })),
    removeChannel: jest.fn(),
    rpc: jest.fn(),
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
      refreshSession: jest.fn(),
    },
  };

  (getWorkingClient as jest.Mock).mockResolvedValue(workingClient);
  (getRealtimeClient as jest.Mock).mockReturnValue(workingClient);
  (refreshSessionLocked as jest.Mock).mockResolvedValue({
    data: { session: {} },
    error: null,
  });
  (fetchGeneralChatMessageWindow as jest.Mock).mockRejectedValue({
    code: 'PGRST202',
    message: 'Could not find function get_general_chat_message_window',
  });
  (isGeneralChatMessageWindowRpcUnavailable as jest.Mock).mockImplementation((error: any) =>
    error?.code === 'PGRST202' ||
    /get_general_chat_message_window|could not find/i.test(error?.message || '')
  );
  (runRealtimeRecovery as jest.Mock).mockResolvedValue({ ok: true, skipped: false, reason: 'channel-error' });
};

beforeEach(() => {
  configureWorkingClient();
});

describe('helper functions', () => {
  it('prepareMessageData trims content', () => {
    const result = prepareMessageData('u1', ' hi ', 'text');
    expect(result).toEqual({ user_id: 'u1', content: 'hi', message_type: 'text' });
  });

  it('prepareMessageData includes reply_to when provided', () => {
    const result = prepareMessageData('u1', 'hi', 'text', undefined, 'p1');
    expect(result).toEqual({
      user_id: 'u1',
      content: 'hi',
      message_type: 'text',
      reply_to: 'p1'
    });
  });

  it('prepareMessageData includes thumbnail metadata when provided', () => {
    const result = prepareMessageData('u1', '', 'image', 'https://example.com/full.png', undefined, undefined, 'https://example.com/thumb.png');
    expect(result).toMatchObject({
      user_id: 'u1',
      content: '',
      message_type: 'image',
      file_url: 'https://example.com/full.png',
      thumbnail_url: 'https://example.com/thumb.png',
    });
    expect(result.media_processed_at).toEqual(expect.any(String));
  });

  it('prepareMessageData stores video metadata and file url', () => {
    const result = prepareMessageData(
      'u1',
      '{"name":"clip.mp4","size":5,"type":"video/mp4"}',
      'video',
      'https://example.com/clip.mp4'
    );
    expect(result).toEqual({
      user_id: 'u1',
      content: '{"name":"clip.mp4","size":5,"type":"video/mp4"}',
      message_type: 'video',
      file_url: 'https://example.com/clip.mp4',
    });
  });

  it('insertMessage inserts through supabase', async () => {
    const insertMock = jest.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: '1' } as any, error: null }) }) }));
    workingClient.from.mockReturnValueOnce(createQuery({ insert: insertMock }) as any);

    const { data, error } = await insertMessage({ user_id: 'u1', content: 'hi', message_type: 'text' });
    expect(insertMock).toHaveBeenCalledWith({ user_id: 'u1', content: 'hi', message_type: 'text' });
    expect(data).toEqual({ id: '1' });
    expect(error).toBeNull();
  });

  it('insertMessage falls back when production schema is missing client_message_id', async () => {
    const missingColumnInsert = jest.fn(() => ({
      select: () => ({
        single: () => Promise.resolve({
          data: null,
          error: {
            code: 'PGRST204',
            message: "Could not find the 'client_message_id' column of 'messages' in the schema cache",
          },
        }),
      }),
    }));
    const legacyInsert = jest.fn(() => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: '1' } as any, error: null }),
      }),
    }));
    workingClient.from
      .mockReturnValueOnce(createQuery({ insert: missingColumnInsert }) as any)
      .mockReturnValueOnce(createQuery({ insert: legacyInsert }) as any);

    const { data, error } = await insertMessage({
      user_id: 'u1',
      client_message_id: 'client-1',
      content: 'hi',
      message_type: 'text',
    });

    expect(missingColumnInsert).toHaveBeenCalledWith({
      user_id: 'u1',
      client_message_id: 'client-1',
      content: 'hi',
      message_type: 'text',
    });
    expect(legacyInsert).toHaveBeenCalledWith({
      user_id: 'u1',
      content: 'hi',
      message_type: 'text',
    });
    expect(data).toEqual({ id: '1' });
    expect(error).toBeNull();
  });

  it('refreshSessionAndRetry refreshes and retries insert', async () => {
    const insertSpy = jest.spyOn(messagesModule, 'insertMessage').mockResolvedValueOnce({ data: { id: '1' } as any, error: null });

    const { data, error } = await refreshSessionAndRetry({ user_id: 'u1', content: 'hi', message_type: 'text' });

    expect(refreshSessionLocked).toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalled();
    expect(data).toEqual({ id: '1' });
    expect(error).toBeNull();
    insertSpy.mockRestore();
  });
});

describe('message fetching windows', () => {
  const user = { id: 'user1' } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    configureWorkingClient();
    (useAuth as jest.Mock).mockReturnValue({
      user,
      profile: { id: user.id, username: 'alice', display_name: 'Alice' },
    });
    (ensureSession as jest.Mock).mockResolvedValue(true);
  });

  const renderWithLatestWindow = async (latestWindow = makeLatestWindow()) => {
    const pinnedQuery = createThenableQuery({ data: [], error: null });
    const latestQuery = createThenableQuery({
      data: [...latestWindow].reverse(),
      error: null,
    });
    workingClient.from
      .mockReturnValueOnce(pinnedQuery as any)
      .mockReturnValueOnce(latestQuery as any);

    const hook = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await waitFor(() => expect(hook.result.current.messages).toHaveLength(latestWindow.length));

    return {
      ...hook,
      latestWindow,
      pinnedQuery,
      latestQuery,
    };
  };

  it('requests the latest window with deterministic timestamp and id ordering', async () => {
    const { latestQuery } = await renderWithLatestWindow();

    expect(latestQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(latestQuery.order).toHaveBeenCalledWith('id', { ascending: false });
  });

  it('loads older history with a created_at and id keyset when timestamps collide', async () => {
    const { result, latestWindow } = await renderWithLatestWindow();
    const anchor = latestWindow[0];
    const pinnedQuery = createThenableQuery({ data: [], error: null });
    const olderQuery = createThenableQuery({ data: [], error: null });
    workingClient.from
      .mockReturnValueOnce(pinnedQuery as any)
      .mockReturnValueOnce(olderQuery as any);

    await act(async () => {
      await result.current.loadOlderMessages();
    });

    expect(olderQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(olderQuery.order).toHaveBeenCalledWith('id', { ascending: false });
    expect(olderQuery.or).toHaveBeenCalledWith(
      `created_at.lt.${anchor.created_at},and(created_at.eq.${anchor.created_at},id.lt.${anchor.id})`
    );
    expect(olderQuery.lt).not.toHaveBeenCalledWith('created_at', anchor.created_at);
  });

  it('marks newer realtime messages pending while an older window is anchored', async () => {
    let broadcastHandler: ((payload: any) => void) | undefined;
    workingClient.channel.mockImplementation(() => {
      const channel: any = {
        on: jest.fn((event: string, filter: any, handler: any) => {
          if (event === 'broadcast' && filter?.event === 'new_message') {
            broadcastHandler = handler;
          }
          return channel;
        }),
        subscribe: jest.fn(() => channel),
        send: jest.fn(),
        state: 'joined',
      };
      return channel;
    });

    const { result } = await renderWithLatestWindow();
    await waitFor(() => expect(broadcastHandler).toBeDefined());

    const pinnedQuery = createThenableQuery({ data: [], error: null });
    const olderQuery = createThenableQuery({ data: [], error: null });
    workingClient.from
      .mockReturnValueOnce(pinnedQuery as any)
      .mockReturnValueOnce(olderQuery as any);

    await act(async () => {
      await result.current.loadOlderMessages();
    });

    expect(result.current.windowMode).toBe('older');

    const realtimeMessage = {
      ...makeDbMessage('z-new', '2026-05-03T12:00:01.000Z'),
      user_id: 'other-user',
    } as Message;

    await act(async () => {
      broadcastHandler?.({ payload: realtimeMessage });
    });

    await waitFor(() => expect(result.current.hasNewer).toBe(true));
    expect(result.current.messages.some(message => message.id === realtimeMessage.id)).toBe(false);
  });
});

describe('sendMessage', () => {
  const user = { id: 'user1' } as any;
  beforeEach(() => {
    jest.resetAllMocks();
    configureWorkingClient();
    (useAuth as jest.Mock).mockReturnValue({ user });

    const sb = supabase as SupabaseMock;

    // default mock implementations
    sb.from.mockImplementation(() => createQuery() as any);
    sb.channel.mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
      send: jest.fn(),
    } as any);
    sb.removeChannel.mockResolvedValue();
    sb.auth = {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
      refreshSession: jest.fn(),
    } as any;
    (ensureSession as jest.Mock).mockResolvedValue(true);
  });

  it('calls ensureSession and inserts message', async () => {
    const insertSpy = jest
      .spyOn(messagesModule, 'insertMessage')
      .mockResolvedValueOnce({ data: { id: '1' } as any, error: null });

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(ensureSession).toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalled();
    insertSpy.mockRestore();
  });

  it('inserts message with reply_to', async () => {
    const insertSpy = jest
      .spyOn(messagesModule, 'insertMessage')
      .mockResolvedValueOnce({ data: { id: '1' } as any, error: null });

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.sendMessage('hello', 'text', undefined, 'parent');
    });

    expect(insertSpy).toHaveBeenCalledWith({
      user_id: user.id,
      client_message_id: expect.any(String),
      content: 'hello',
      message_type: 'text',
      reply_to: 'parent'
    });
    insertSpy.mockRestore();
  });

  it('inserts audio message with correct type', async () => {
    const insertSpy = jest
      .spyOn(messagesModule, 'insertMessage')
      .mockResolvedValueOnce({ data: { id: '1' } as any, error: null });

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.sendMessage('https://example.com/audio.webm', 'audio');
    });

    expect(insertSpy).toHaveBeenCalledWith({
      user_id: user.id,
      client_message_id: expect.any(String),
      content: '',
      message_type: 'audio',
      audio_url: 'https://example.com/audio.webm',
    });
    insertSpy.mockRestore();
  });

  it('refreshes session and retries on 401 insert error', async () => {
    const insertSpy = jest
      .spyOn(messagesModule, 'insertMessage')
      .mockResolvedValueOnce({
        data: null,
        error: { status: 401, message: 'unauthorized' },
      } as any);
    const retrySpy = jest
      .spyOn(messagesModule, 'refreshSessionAndRetry')
      .mockResolvedValueOnce({ data: { id: '1' } as any, error: null });

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(insertSpy).toHaveBeenCalled();
    expect(retrySpy).toHaveBeenCalled();
    insertSpy.mockRestore();
    retrySpy.mockRestore();
  });
});

describe('realtime recovery', () => {
  const user = { id: 'user1' } as any;

  beforeEach(() => {
    jest.resetAllMocks();
    configureWorkingClient();
    (useAuth as jest.Mock).mockReturnValue({ user });
    (ensureSession as jest.Mock).mockResolvedValue(true);
  });

  it('uses a fresh channel topic when recovery resubscribes', async () => {
    const realtimeRecoveryMock = jest.requireMock('../src/hooks/useRealtimeRecovery') as {
      useRealtimeRecovery: jest.Mock
    };
    workingClient.channel.mockImplementation(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
      send: jest.fn(),
      state: 'closed',
    }));

    renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await waitFor(() => expect(workingClient.channel.mock.calls.length).toBeGreaterThan(0));
    const initialChannelCalls = workingClient.channel.mock.calls.length;

    const recoveryHandler = realtimeRecoveryMock.useRealtimeRecovery.mock.calls[0]?.[0] as
      | ((result: { ok: true; skipped: false; reason: 'resume' }) => void)
      | undefined;
    expect(recoveryHandler).toBeDefined();

    act(() => {
      recoveryHandler?.({ ok: true, skipped: false, reason: 'resume' });
    });

    await waitFor(() => expect(workingClient.channel.mock.calls.length).toBeGreaterThan(initialChannelCalls));

    const topics = workingClient.channel.mock.calls.map(([topic]) => topic as string);
    expect(topics.every(topic => /^public:messages:user1:/.test(topic))).toBe(true);
    expect(new Set(topics).size).toBe(topics.length);
  });
});

describe('message actions', () => {
  const user = { id: 'user1' } as any;
  beforeEach(() => {
    jest.resetAllMocks();
    configureWorkingClient();
    (useAuth as jest.Mock).mockReturnValue({ user });
    (ensureSession as jest.Mock).mockResolvedValue(true);
  });

  it('edits message', async () => {
    const query = createQuery();
    const updateFn = jest.fn(() => query);
    const eqFn = jest.fn(() => query);
    query.update = updateFn;
    query.eq = eqFn;

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await Promise.resolve()
    })

    workingClient.from.mockClear();
    workingClient.from.mockReturnValueOnce(query as any);

    await act(async () => {
      await result.current.editMessage('m1', 'hi');
    });

    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ content: 'hi', edited_at: expect.any(String) }));
    expect(eqFn).toHaveBeenNthCalledWith(1, 'id', 'm1');
    expect(eqFn).toHaveBeenNthCalledWith(2, 'user_id', user.id);
  });

  it('deletes message', async () => {
    const query = createQuery();
    const deleteFn = jest.fn(() => query);
    const eqFn = jest.fn(() => query);
    query.delete = deleteFn;
    query.eq = eqFn;

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await Promise.resolve()
    })

    workingClient.from.mockClear();
    workingClient.from.mockReturnValueOnce(query as any);

    await act(async () => {
      await result.current.deleteMessage('m1');
    });

    expect(deleteFn).toHaveBeenCalled();
    expect(eqFn).toHaveBeenNthCalledWith(1, 'id', 'm1');
    expect(eqFn).toHaveBeenCalledTimes(1);
    expect(query.select).toHaveBeenCalledWith('id');
    expect(query.maybeSingle).toHaveBeenCalled();
  });

  it('does not treat zero-row message deletes as successful', async () => {
    const query = createQuery({
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await Promise.resolve()
    })

    workingClient.from.mockClear();
    workingClient.from.mockReturnValueOnce(query as any);

    await expect(
      act(async () => {
        await result.current.deleteMessage('m1');
      })
    ).rejects.toThrow('Message delete was not confirmed by the server.');
  });

  it('toggles reaction', async () => {
    const rpcFn = jest.fn().mockResolvedValue({ data: null, error: null });
    workingClient.rpc.mockImplementationOnce(rpcFn);

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.toggleReaction('m1', '😀');
    });

    expect(rpcFn).toHaveBeenCalledWith('toggle_message_reaction', { message_id: 'm1', emoji: '😀', is_dm: false });
  });

  it('toggles pin state', async () => {
    const rpcFn = jest.fn().mockResolvedValue({ data: null, error: null });
    workingClient.rpc.mockImplementationOnce(rpcFn);

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.togglePin('m1');
    });

    expect(rpcFn).toHaveBeenCalledWith('toggle_message_pin', { message_id: 'm1' });
  });
});
