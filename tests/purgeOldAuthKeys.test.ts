import { purgeOldAuthKeys, createFreshSupabaseClient, localStorageKey } from '../src/lib/supabase';
import { createClient } from '@supabase/supabase-js';

jest.mock('@supabase/supabase-js', () => {
  return {
    createClient: jest.fn(() => ({ auth: {}, realtime: {} }))
  };
});

beforeEach(() => {
  localStorage.clear();
  (createClient as jest.Mock).mockClear();
});

test('purgeOldAuthKeys removes stale keys', () => {
  const prefix = `${localStorageKey}-fresh-`;
  localStorage.setItem(`${prefix}old`, 'a');
  localStorage.setItem(`${prefix}keep`, 'b');
  purgeOldAuthKeys(`${prefix}keep`);
  expect(localStorage.getItem(`${prefix}old`)).toBeNull();
  expect(localStorage.getItem(`${prefix}keep`)).toBe('b');
});

test('createFreshSupabaseClient purges previous keys', () => {
  const prefix = `${localStorageKey}-fresh-`;
  localStorage.setItem(`${prefix}stale`, 'x');
  const client = createFreshSupabaseClient();
  const key = (client as any).__storageKey;
  expect(localStorage.getItem(`${prefix}stale`)).toBeNull();
  expect(localStorage.getItem(key)).not.toBeNull();
});
