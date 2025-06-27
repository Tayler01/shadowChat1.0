import { renderHook, act } from '@testing-library/react';
import { useTyping } from '../src/hooks/useTyping';
import { useAuth } from '../src/hooks/useAuth';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/hooks/useAuth');
jest.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      from: jest.fn(),
      channel: jest.fn(),
      removeChannel: jest.fn(),
      auth: { getSession: jest.fn(), refreshSession: jest.fn() },
    },
  };
});

type SupabaseMock = jest.Mocked<typeof supabase>;

beforeEach(() => {
  jest.resetAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 'u1', username: 'u', display_name: 'U' } });

  const sb = supabase as SupabaseMock;
  sb.channel.mockReturnValue({ on: jest.fn().mockReturnThis(), subscribe: jest.fn(), send: jest.fn() } as any);
  sb.removeChannel.mockResolvedValue();
});

test('startTyping sends typing true broadcast', async () => {
  const sendMock = jest.fn();
  (supabase.channel as jest.Mock).mockReturnValueOnce({ on: jest.fn().mockReturnThis(), subscribe: jest.fn(), send: sendMock } as any);

  const { result } = renderHook(() => useTyping('general'));

  await act(async () => {
    await result.current.startTyping();
  });

  expect(sendMock).toHaveBeenCalledWith({
    type: 'broadcast',
    event: 'typing',
    payload: {
      user: { id: 'u1', username: 'u', display_name: 'U' },
      typing: true,
    },
  });
  expect(result.current.isTyping).toBe(true);
});

test('stopTyping sends typing false broadcast', async () => {
  const sendMock = jest.fn();
  (supabase.channel as jest.Mock).mockReturnValueOnce({ on: jest.fn().mockReturnThis(), subscribe: jest.fn(), send: sendMock } as any);

  const { result } = renderHook(() => useTyping('general'));

  await act(async () => {
    await result.current.startTyping();
    await result.current.stopTyping();
  });

  expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ typing: false }) }));
  expect(result.current.isTyping).toBe(false);
});
