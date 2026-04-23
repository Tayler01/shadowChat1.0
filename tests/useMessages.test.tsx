import { renderHook, act } from '@testing-library/react';
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
  getWorkingClient,
  getRealtimeClient,
  refreshSessionLocked,
  resetRealtimeConnection,
} from '../src/lib/supabase';

jest.mock('../src/hooks/useAuth');
jest.mock('../src/hooks/useVisibilityRefresh', () => ({
  useVisibilityRefresh: jest.fn(),
}));
jest.mock('../src/hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({ playMessage: jest.fn(), playReaction: jest.fn() }),
}));
jest.mock('../src/lib/push', () => ({
  triggerGroupPushNotification: jest.fn().mockResolvedValue(undefined),
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
    refreshSessionLocked: jest.fn(),
    resetRealtimeConnection: jest.fn(),
    ensureSession: jest.fn(),
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
    limit: jest.fn(() => query),
    update: jest.fn(() => query),
    delete: jest.fn(() => query),
    eq: jest.fn(() => query),
    rpc: jest.fn(() => query),
  };

  Object.assign(query, overrides);
  return query;
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
  (resetRealtimeConnection as jest.Mock).mockResolvedValue(undefined);
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

  it('insertMessage inserts through supabase', async () => {
    const insertMock = jest.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: '1' } as any, error: null }) }) }));
    workingClient.from.mockReturnValueOnce(createQuery({ insert: insertMock }) as any);

    const { data, error } = await insertMessage({ user_id: 'u1', content: 'hi', message_type: 'text' });
    expect(insertMock).toHaveBeenCalledWith({ user_id: 'u1', content: 'hi', message_type: 'text' });
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
    expect(eqFn).toHaveBeenNthCalledWith(2, 'user_id', user.id);
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
