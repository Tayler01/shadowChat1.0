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
import { supabase, ensureSession } from '../src/lib/supabase';

jest.mock('../src/hooks/useAuth');
jest.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      from: jest.fn(),
      channel: jest.fn(),
      removeChannel: jest.fn(),
      rpc: jest.fn(),
      auth: { getSession: jest.fn(), refreshSession: jest.fn() },
    },
    ensureSession: jest.fn(),
  };
});

type SupabaseMock = jest.Mocked<typeof supabase>;

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
    const insertMock = jest.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: '1' }, error: null }) }) }));
    (supabase.from as jest.Mock).mockReturnValueOnce({ insert: insertMock } as any);

    const { data, error } = await insertMessage({ user_id: 'u1', content: 'hi', message_type: 'text' });
    expect(insertMock).toHaveBeenCalledWith({ user_id: 'u1', content: 'hi', message_type: 'text' });
    expect(data).toEqual({ id: '1' });
    expect(error).toBeNull();
  });

  it('refreshSessionAndRetry refreshes and retries insert', async () => {
    const insertSpy = jest.spyOn(messagesModule, 'insertMessage').mockResolvedValueOnce({ data: { id: '1' }, error: null });
    (supabase.auth.refreshSession as jest.Mock).mockResolvedValue({ data: { session: {} }, error: null });

    const { data, error } = await refreshSessionAndRetry({ user_id: 'u1', content: 'hi', message_type: 'text' });

    expect(supabase.auth.refreshSession).toHaveBeenCalled();
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

  it('inserts message with reply_to', async () => {
    const insertFn = jest.fn(() => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: '1' }, error: null }) })
    }));
    (supabase.from as jest.Mock).mockReturnValueOnce({ insert: insertFn } as any);

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.sendMessage('hello', 'text', undefined, 'parent');
    });

    expect(insertFn).toHaveBeenCalledWith({
      user_id: user.id,
      content: 'hello',
      message_type: 'text',
      reply_to: 'parent'
    });
  });

  it('inserts audio message with correct type', async () => {
    const insertFn = jest.fn(() => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: '1' }, error: null }) })
    }));
    (supabase.from as jest.Mock).mockReturnValueOnce({ insert: insertFn } as any);

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.sendMessage('https://example.com/audio.webm', 'audio');
    });

    expect(insertFn).toHaveBeenCalledWith({
      user_id: user.id,
      content: '',
      message_type: 'audio',
      audio_url: 'https://example.com/audio.webm',
    });
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

describe('message actions', () => {
  const user = { id: 'user1' } as any;
  beforeEach(() => {
    jest.resetAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user });

    const sb = supabase as SupabaseMock;

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

  it('edits message', async () => {
    const updateFn = jest.fn().mockReturnThis();
    const eqFn = jest.fn().mockReturnThis();
    (supabase.from as jest.Mock).mockReturnValueOnce({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: [], error: null }),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      update: updateFn,
      delete: jest.fn().mockReturnThis(),
      eq: eqFn,
      rpc: jest.fn().mockReturnThis(),
    } as any);

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.editMessage('m1', 'hi');
    });

    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ content: 'hi', edited_at: expect.any(String) }));
    expect(eqFn).toHaveBeenNthCalledWith(1, 'id', 'm1');
    expect(eqFn).toHaveBeenNthCalledWith(2, 'user_id', user.id);
  });

  it('deletes message', async () => {
    const deleteFn = jest.fn().mockReturnThis();
    const eqFn = jest.fn().mockReturnThis();
    (supabase.from as jest.Mock).mockReturnValueOnce({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: [], error: null }),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: deleteFn,
      eq: eqFn,
      rpc: jest.fn().mockReturnThis(),
    } as any);

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.deleteMessage('m1');
    });

    expect(deleteFn).toHaveBeenCalled();
    expect(eqFn).toHaveBeenNthCalledWith(1, 'id', 'm1');
    expect(eqFn).toHaveBeenNthCalledWith(2, 'user_id', user.id);
  });

  it('toggles reaction', async () => {
    const rpcFn = jest.fn().mockResolvedValue({ data: null, error: null });
    (supabase.rpc as jest.Mock).mockImplementationOnce(rpcFn);

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.toggleReaction('m1', '😀');
    });

    expect(rpcFn).toHaveBeenCalledWith('toggle_message_reaction', { message_id: 'm1', emoji: '😀', is_dm: false });
  });

  it('toggles pin state', async () => {
    const rpcFn = jest.fn().mockResolvedValue({ data: null, error: null });
    (supabase.rpc as jest.Mock).mockImplementationOnce(rpcFn);

    const { result } = renderHook(() => useMessages(), { wrapper: MessagesProvider });

    await act(async () => {
      await result.current.togglePin('m1');
    });

    expect(rpcFn).toHaveBeenCalledWith('toggle_message_pin', { message_id: 'm1' });
  });
});
