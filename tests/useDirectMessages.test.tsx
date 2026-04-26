import { renderHook, act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useDirectMessages, DirectMessagesProvider } from '../src/hooks/useDirectMessages';
import { useAuth } from '../src/hooks/useAuth';
import * as dmModule from '../src/hooks/useDirectMessages';
import * as searchModule from '../src/hooks/useUserSearch';
import * as allUsersModule from '../src/hooks/useAllUsers';
import {
  fetchDMConversations,
  getOrCreateDMConversation,
  getRealtimeClient,
  getWorkingClient,
  ensureSession,
  markDMMessagesRead,
  recoverSessionAfterResume,
  refreshSessionLocked,
  resetRealtimeConnection,
  supabase,
} from '../src/lib/supabase';
import { DirectMessagesView } from '../src/components/dms/DirectMessagesView';
import { triggerDMPushNotification } from '../src/lib/push';

jest.mock('../src/hooks/useAuth');
jest.mock('../src/hooks/useVisibilityRefresh', () => ({
  useVisibilityRefresh: jest.fn(),
}));
jest.mock('../src/hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({ playMessage: jest.fn() }),
}));
jest.mock('../src/hooks/useTyping', () => ({
  useTyping: () => ({ typingUsers: [], startTyping: jest.fn(), stopTyping: jest.fn() }),
}));
jest.mock('../src/hooks/useIsDesktop', () => ({
  useIsDesktop: jest.fn(() => true),
}));
jest.mock('../src/lib/push', () => ({
  triggerDMPushNotification: jest.fn().mockResolvedValue(undefined),
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
      auth: { getSession: jest.fn(), refreshSession: jest.fn() },
    },
    getWorkingClient: jest.fn(),
    getRealtimeClient: jest.fn(),
    fetchDMConversations: jest.fn().mockResolvedValue([]),
    getOrCreateDMConversation: jest.fn(),
    markDMMessagesRead: jest.fn(),
    ensureSession: jest.fn().mockResolvedValue(true),
    recoverSessionAfterResume: jest.fn().mockResolvedValue(true),
    refreshSessionLocked: jest.fn(),
    resetRealtimeConnection: jest.fn(),
    withTimeout: jest.fn((promise: Promise<unknown>) => promise),
  };
});

type SupabaseMock = jest.Mocked<typeof supabase>;
type WorkingClient = {
  from: jest.Mock;
  channel: jest.Mock;
  removeChannel: jest.Mock;
  auth: {
    getSession: jest.Mock;
    refreshSession: jest.Mock;
  };
};

const createQuery = (overrides: Record<string, unknown> = {}) => {
  const query: Record<string, any> = {
    select: jest.fn(() => query),
    single: jest.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    order: jest.fn(() => query),
    limit: jest.fn(() => query),
    update: jest.fn(() => query),
    delete: jest.fn(() => query),
    eq: jest.fn(() => query),
    neq: jest.fn(() => query),
    is: jest.fn(() => query),
    insert: jest.fn(() => query),
    contains: jest.fn(() => query),
  };

  Object.assign(query, overrides);
  return query;
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

let workingClient: WorkingClient;

beforeEach(() => {
  jest.resetAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });

  workingClient = {
    from: jest.fn(() => createQuery()),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
      send: jest.fn(),
      state: 'joined',
    })),
    removeChannel: jest.fn(),
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
    },
  };

  (getWorkingClient as jest.Mock).mockResolvedValue(workingClient);
  (getRealtimeClient as jest.Mock).mockReturnValue(workingClient);
  (fetchDMConversations as jest.Mock).mockResolvedValue([]);
  (markDMMessagesRead as jest.Mock).mockResolvedValue(undefined);
  (ensureSession as jest.Mock).mockResolvedValue(true);
  (recoverSessionAfterResume as jest.Mock).mockResolvedValue(true);
  (refreshSessionLocked as jest.Mock).mockResolvedValue({ data: { session: {} }, error: null });
  (resetRealtimeConnection as jest.Mock).mockResolvedValue(undefined);
  (triggerDMPushNotification as jest.Mock).mockResolvedValue(undefined);

  const sb = supabase as SupabaseMock;
  sb.from.mockImplementation(() => createQuery() as any);
  sb.channel.mockReturnValue({ on: jest.fn().mockReturnThis(), subscribe: jest.fn(), send: jest.fn(), state: 'joined' } as any);
  sb.removeChannel.mockResolvedValue();
});

test('sendMessage retries on 401 error', async () => {
  const insertFail = jest.fn(() => ({
    select: () => ({
      single: () => Promise.resolve({ data: null, error: { status: 401, message: 'unauth' } }),
    }),
  }));
  const insertSuccess = jest.fn(() => ({
    select: () => ({
      single: () => Promise.resolve({ data: { id: '1' }, error: null }),
    }),
  }));

  const { result } = renderHook(() => useDirectMessages(), { wrapper: DirectMessagesProvider });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    result.current.setCurrentConversation('conv1');
  });

  workingClient.from.mockClear();
  workingClient.from
    .mockReturnValueOnce(createQuery({ insert: insertFail }) as any)
    .mockReturnValueOnce(createQuery({ insert: insertSuccess }) as any);
  (ensureSession as jest.Mock)
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(true);

  await act(async () => {
    await result.current.sendMessage('hello');
  });

  expect(insertFail).toHaveBeenCalled();
  expect(ensureSession).toHaveBeenNthCalledWith(1);
  expect(ensureSession).toHaveBeenNthCalledWith(2, true);
  expect(insertSuccess).toHaveBeenCalled();
});

test('sends audio message with proper type', async () => {
  const insertFn = jest.fn(() => ({
    select: () => ({ single: () => Promise.resolve({ data: { id: '1' }, error: null }) })
  }));

  const { result } = renderHook(() => useDirectMessages(), { wrapper: DirectMessagesProvider });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    result.current.setCurrentConversation('conv1');
  });

  workingClient.from.mockClear();
  workingClient.from.mockImplementationOnce(() => createQuery({ insert: insertFn }) as any);

  await act(async () => {
    await result.current.sendMessage('https://example.com/a.webm', 'audio');
  });

  expect(insertFn).toHaveBeenCalledWith({
    conversation_id: 'conv1',
    sender_id: 'u1',
    content: '',
    message_type: 'audio',
    audio_url: 'https://example.com/a.webm',
  });
});

test('startConversation sets currentConversation', async () => {
  const maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'u2' }, error: null });
  workingClient.from.mockImplementationOnce(() => createQuery({ maybeSingle }) as any);

  const conversation = { id: 'c1' } as any;
  (getOrCreateDMConversation as jest.Mock).mockResolvedValue(conversation);
  (fetchDMConversations as jest.Mock).mockResolvedValue([{ id: 'c1' }]);

  const { result } = renderHook(() => useDirectMessages(), { wrapper: DirectMessagesProvider });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    const id = await result.current.startConversation('bob');
    expect(id).toBe('c1');
  });

  expect(result.current.currentConversation).toBe('c1');
  expect(maybeSingle).toHaveBeenCalled();
});

test('startConversation throws when user not found', async () => {
  workingClient.from.mockImplementationOnce(() => createQuery({
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  }) as any);

  const { result } = renderHook(() => useDirectMessages(), { wrapper: DirectMessagesProvider });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await expect(result.current.startConversation('missing')).rejects.toThrow('User not found');
});

test('marks visible unread messages as read through the RPC helper', async () => {
  const unreadMessage = {
    id: 'm1',
    conversation_id: 'conv1',
    sender_id: 'u2',
    content: 'hello',
    message_type: 'text',
    read_by: null,
    created_at: '2026-04-21T12:00:00.000Z',
    updated_at: '2026-04-21T12:00:00.000Z',
    reactions: {},
  };

  workingClient.from.mockImplementation(() =>
    createQuery({
      select: jest.fn(function () { return this; }),
      eq: jest.fn(function () { return this; }),
      order: jest.fn(function () { return this; }),
      limit: jest.fn().mockResolvedValue({ data: [unreadMessage], error: null }),
    }) as any
  );

  const { result } = renderHook(() => useDirectMessages(), { wrapper: DirectMessagesProvider });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    result.current.setCurrentConversation('conv1');
  });

  await waitFor(() => {
    expect(markDMMessagesRead).toHaveBeenCalledWith('conv1');
  });
});

test('ignores stale message fetches after switching conversations', async () => {
  const staleFetch = createDeferred<{ data: unknown[]; error: null }>();
  const conv1Message = {
    id: 'm1',
    conversation_id: 'conv1',
    sender_id: 'u1',
    content: 'old thread',
    message_type: 'text',
    created_at: '2026-04-21T12:00:00.000Z',
    updated_at: '2026-04-21T12:00:00.000Z',
    reactions: {},
  };
  const conv2Message = {
    id: 'm2',
    conversation_id: 'conv2',
    sender_id: 'u1',
    content: 'new thread',
    message_type: 'text',
    created_at: '2026-04-21T12:01:00.000Z',
    updated_at: '2026-04-21T12:01:00.000Z',
    reactions: {},
  };

  workingClient.from
    .mockImplementationOnce(() =>
      createQuery({
        limit: jest.fn(() => staleFetch.promise),
      }) as any
    )
    .mockImplementationOnce(() =>
      createQuery({
        limit: jest.fn().mockResolvedValue({ data: [conv2Message], error: null }),
      }) as any
    );

  const { result } = renderHook(() => useDirectMessages(), { wrapper: DirectMessagesProvider });

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    result.current.setCurrentConversation('conv1');
  });

  await waitFor(() => expect(workingClient.from).toHaveBeenCalledTimes(1));

  await act(async () => {
    result.current.setCurrentConversation('conv2');
  });

  await waitFor(() => expect(result.current.messages.map(message => message.id)).toEqual(['m2']));

  await act(async () => {
    staleFetch.resolve({ data: [conv1Message], error: null });
  });

  expect(result.current.messages.map(message => message.id)).toEqual(['m2']);
});

describe('DirectMessagesView user search', () => {
  let dmSpy: jest.SpyInstance;
  let searchSpy: jest.SpyInstance;
  let allSpy: jest.SpyInstance;
  let startConversationMock: jest.Mock;
  let setCurrentConversationMock: jest.Mock;

  const user = {
    id: 'u2',
    username: 'bob',
    display_name: 'Bob',
    avatar_url: '',
    color: 'red',
    status: 'online',
  };

  beforeEach(() => {
    startConversationMock = jest.fn().mockResolvedValue('c1');
    setCurrentConversationMock = jest.fn();

    dmSpy = jest.spyOn(dmModule, 'useDirectMessages');
    dmSpy.mockReturnValue({
      conversations: [],
      currentConversation: null,
      messages: [],
      loading: false,
      setCurrentConversation: setCurrentConversationMock,
      startConversation: startConversationMock,
      sendMessage: jest.fn(),
      markAsRead: jest.fn(),
    } as any);

    searchSpy = jest.spyOn(searchModule, 'useUserSearch');
    searchSpy.mockReturnValue({ results: [user], loading: false, error: null });

    allSpy = jest.spyOn(allUsersModule, 'useAllUsers');
    allSpy.mockReturnValue({ users: [user], loading: false, error: null });

    (useAuth as jest.Mock).mockReturnValue({ profile: { id: 'u1' } });
  });

  afterEach(() => {
    dmSpy.mockRestore();
    searchSpy.mockRestore();
    allSpy.mockRestore();
  });

  test('selecting a user starts conversation and sets id', async () => {
    render(
      <DirectMessagesView
        onToggleSidebar={() => {}}
        currentView="dms"
        onViewChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /start new conversation/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by username/i), { target: { value: 'bob' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /bob/i }));
    });

    expect(startConversationMock).toHaveBeenCalledWith('bob');
    await waitFor(() => expect(setCurrentConversationMock).toHaveBeenCalledWith('c1'));
  });

  test('shows user not found error', async () => {
    searchSpy.mockReturnValue({ results: [], loading: false, error: 'User not found' });
    allSpy.mockReturnValue({ users: [], loading: false, error: null });

    render(
      <DirectMessagesView
        onToggleSidebar={() => {}}
        currentView="dms"
        onViewChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /start new conversation/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by username/i), { target: { value: 'alice' } });

    expect(await screen.findByText(/user not found/i)).toBeInTheDocument();
    expect(startConversationMock).not.toHaveBeenCalled();
    expect(setCurrentConversationMock).not.toHaveBeenCalled();
  });

  test('displays all users when search empty', () => {
    allSpy.mockReturnValueOnce({
      users: [user, { ...user, id: 'u3', username: 'alice', display_name: 'Alice' }],
      loading: false,
      error: null,
    });
    searchSpy.mockReturnValueOnce({ results: [], loading: false, error: null });

    render(
      <DirectMessagesView
        onToggleSidebar={() => {}}
        currentView="dms"
        onViewChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /start new conversation/i }));

    expect(screen.getByRole('button', { name: /bob/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /alice/i })).toBeInTheDocument();
  });

  test('mobile inbox back button returns to chat', async () => {
    const onViewChange = jest.fn();
    const { useIsDesktop } = jest.requireMock('../src/hooks/useIsDesktop') as {
      useIsDesktop: jest.Mock
    };
    useIsDesktop.mockReturnValue(false);

    render(
      <DirectMessagesView
        onToggleSidebar={() => {}}
        currentView="dms"
        onViewChange={onViewChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));

    expect(onViewChange).toHaveBeenCalledWith('chat');
  });
});
