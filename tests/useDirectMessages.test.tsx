import { renderHook, act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useDirectMessages } from '../src/hooks/useDirectMessages';
import { useAuth } from '../src/hooks/useAuth';
import * as dmModule from '../src/hooks/useDirectMessages';
import * as searchModule from '../src/hooks/useUserSearch';
import { supabase, getOrCreateDMConversation } from '../src/lib/supabase';
import { DirectMessagesView } from '../src/components/dms/DirectMessagesView';

jest.mock('../src/hooks/useAuth');
jest.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      from: jest.fn(),
      channel: jest.fn(),
      removeChannel: jest.fn(),
      auth: { getSession: jest.fn(), refreshSession: jest.fn() },
    },
    fetchDMConversations: jest.fn().mockResolvedValue([]),
    getOrCreateDMConversation: jest.fn(),
    markDMMessagesRead: jest.fn(),
  };
});

type SupabaseMock = jest.Mocked<typeof supabase>;

beforeEach(() => {
  jest.resetAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1' } });

  const sb = supabase as SupabaseMock;
  sb.from.mockImplementation(() => ({
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: [], error: null }),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    rpc: jest.fn().mockReturnThis(),
  } as any));
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

  const sb = supabase as SupabaseMock;
  sb.from.mockImplementation(() => ({
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: [], error: null }),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    rpc: jest.fn().mockReturnThis(),
  } as any));

  const { result } = renderHook(() => useDirectMessages());

  await act(async () => {
    result.current.setCurrentConversation('conv1');
  });

  sb.from.mockClear();
  (sb.from as jest.Mock).mockImplementationOnce(() => ({
    insert: insertFail,
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: [], error: null }),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    rpc: jest.fn().mockReturnThis(),
  } as any)).mockImplementationOnce(() => ({
    insert: insertSuccess,
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: [], error: null }),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    rpc: jest.fn().mockReturnThis(),
  } as any));

  sb.auth.refreshSession.mockResolvedValue({ data: { session: {} }, error: null } as any);

  await act(async () => {
    await result.current.sendMessage('hello');
  });

  expect(insertFail).toHaveBeenCalled();
  expect(sb.auth.refreshSession).toHaveBeenCalled();
  expect(insertSuccess).toHaveBeenCalled();
});

test('sends audio message with proper type', async () => {
  const insertFn = jest.fn(() => ({
    select: () => ({ single: () => Promise.resolve({ data: { id: '1' }, error: null }) })
  }));
  const sb = supabase as SupabaseMock;
  sb.from.mockReturnValueOnce({ insert: insertFn } as any);

  const { result } = renderHook(() => useDirectMessages());

  await act(async () => {
    result.current.setCurrentConversation('conv1');
  });

  await act(async () => {
    await result.current.sendMessage('https://example.com/a.webm', 'audio');
  });

  expect(insertFn).toHaveBeenCalledWith({
    conversation_id: 'conv1',
    sender_id: 'u1',
    content: 'https://example.com/a.webm',
    message_type: 'audio',
  });
});

test('startConversation sets currentConversation', async () => {
  const sb = supabase as SupabaseMock;
  const maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'u2' }, error: null });
  sb.from.mockImplementationOnce(() => ({
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: [], error: null }),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    maybeSingle,
    rpc: jest.fn().mockReturnThis(),
  } as any));

  const conversation = { id: 'c1' } as any;
  (getOrCreateDMConversation as jest.Mock).mockResolvedValue(conversation);

  const { result } = renderHook(() => useDirectMessages());

  await act(async () => {
    const id = await result.current.startConversation('bob');
    expect(id).toBe('c1');
  });

  expect(result.current.currentConversation).toBe('c1');
  expect(maybeSingle).toHaveBeenCalled();
});

test('startConversation throws when user not found', async () => {
  const sb = supabase as SupabaseMock;
  sb.from.mockImplementationOnce(() => ({
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: [], error: null }),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    rpc: jest.fn().mockReturnThis(),
  } as any));

  const { result } = renderHook(() => useDirectMessages());

  await expect(result.current.startConversation('missing')).rejects.toThrow('User not found');
});

describe('DirectMessagesView user search', () => {
  let dmSpy: jest.SpyInstance;
  let searchSpy: jest.SpyInstance;
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

    (useAuth as jest.Mock).mockReturnValue({ profile: { id: 'u1' } });
  });

  afterEach(() => {
    dmSpy.mockRestore();
    searchSpy.mockRestore();
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
    fireEvent.change(screen.getByPlaceholderText(/enter username/i), { target: { value: 'bob' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /bob/i }));
    });

    expect(startConversationMock).toHaveBeenCalledWith('bob');
    await waitFor(() => expect(setCurrentConversationMock).toHaveBeenCalledWith('c1'));
  });

  test('shows user not found error', async () => {
    searchSpy.mockReturnValueOnce({ results: [], loading: false, error: 'User not found' });

    render(
      <DirectMessagesView
        onToggleSidebar={() => {}}
        currentView="dms"
        onViewChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /start new conversation/i }));
    fireEvent.change(screen.getByPlaceholderText(/enter username/i), { target: { value: 'alice' } });

    expect(await screen.findByText(/user not found/i)).toBeInTheDocument();
    expect(startConversationMock).not.toHaveBeenCalled();
    expect(setCurrentConversationMock).not.toHaveBeenCalled();
  });
});
