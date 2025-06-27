import { renderHook, act } from '@testing-library/react';
import { MessagesProvider, useMessages } from '../src/hooks/useMessages';
import { useAuth } from '../src/hooks/useAuth';
import { supabase, ensureSession } from '../src/lib/supabase';

jest.mock('../src/hooks/useAuth');
jest.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      from: jest.fn(),
      channel: jest.fn(),
      removeChannel: jest.fn(),
      auth: { getSession: jest.fn(), refreshSession: jest.fn() },
    },
    ensureSession: jest.fn(),
  };
});

type SupabaseMock = jest.Mocked<typeof supabase>;

describe('sendMessage', () => {
  const user = { id: 'user1' } as any;
  beforeEach(() => {
    jest.resetAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user });

    const sb = supabase as SupabaseMock;

    // default mock implementations
    sb.from.mockImplementation(() => {
      return {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: [], error: null }),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        rpc: jest.fn().mockReturnThis(),
      } as any;
    });
    sb.channel.mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
      send: jest.fn(),
    } as any);
    sb.removeChannel.mockResolvedValue();
    sb.auth = {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
    } as any;
    (ensureSession as jest.Mock).mockResolvedValue(true);
  });

  it('calls ensureSession and inserts message', async () => {
    const insertFn = jest.fn(() => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: '1' }, error: null }),
      }),
    }));
    (supabase.from as jest.Mock).mockReturnValueOnce({
      insert: insertFn,
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: [], error: null }),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockReturnThis(),
    } as any);

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(ensureSession).toHaveBeenCalled();
    expect(insertFn).toHaveBeenCalled();
  });

  it('refreshes session and retries on 401 insert error', async () => {
    const insertFail = jest.fn(() => ({
      select: () => ({
        single: () => Promise.resolve({ data: null, error: { status: 401, message: 'unauthorized' } }),
      }),
    }));
    const insertSuccess = jest.fn(() => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: '1' }, error: null }),
      }),
    }));

    (supabase.from as jest.Mock).mockReturnValueOnce({
      insert: insertFail,
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: [], error: null }),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockReturnThis(),
    } as any).mockReturnValueOnce({
      insert: insertSuccess,
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: [], error: null }),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      rpc: jest.fn().mockReturnThis(),
    } as any);

    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({ data: { session: {} }, error: null });

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(insertFail).toHaveBeenCalled();
    expect(supabase.auth.refreshSession).toHaveBeenCalled();
    expect(insertSuccess).toHaveBeenCalled();
  });
});
