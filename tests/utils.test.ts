import { shouldGroupMessage } from '../src/lib/utils';

describe('shouldGroupMessage', () => {
  const baseTime = '2020-01-01T00:00:00Z';

  it('returns false for different users', () => {
    const prev = { id: '1', user_id: 'u1', created_at: baseTime } as any;
    const current = { id: '2', user_id: 'u2', created_at: '2020-01-01T00:01:00Z' } as any;
    expect(shouldGroupMessage(current, prev)).toBe(false);
  });

  it('returns true for same user within 5 minutes', () => {
    const prev = { id: '1', user_id: 'u1', created_at: baseTime } as any;
    const current = { id: '2', user_id: 'u1', created_at: '2020-01-01T00:04:00Z' } as any;
    expect(shouldGroupMessage(current, prev)).toBe(true);
  });

  it('returns true for same user even when time gap is large', () => {
    const prev = { id: '1', user_id: 'u1', created_at: baseTime } as any;
    const current = { id: '2', user_id: 'u1', created_at: '2020-01-02T00:00:00Z' } as any;
    expect(shouldGroupMessage(current, prev)).toBe(true);
  });

  it('handles DM messages', () => {
    const prev = { id: '1', sender_id: 'u1', created_at: baseTime } as any;
    const current = { id: '2', sender_id: 'u1', created_at: '2020-01-01T00:01:00Z' } as any;
    expect(shouldGroupMessage(current, prev)).toBe(true);
  });
});
