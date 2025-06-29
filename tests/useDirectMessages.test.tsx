import { renderHook, act } from '@testing-library/react';
import { useDirectMessages } from '../src/hooks/useDirectMessages';
import { useAuth } from '../src/hooks/useAuth';
import { supabase, getOrCreateDMConversation } from '../src/lib/supabase';

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
