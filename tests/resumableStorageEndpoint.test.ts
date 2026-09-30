import { getResumableStorageEndpoint } from '../src/lib/resumableStorageEndpoint'

test('preserves the local Supabase port for resumable uploads', () => {
  expect(getResumableStorageEndpoint('http://127.0.0.1:55321'))
    .toBe('http://127.0.0.1:55321/storage/v1/upload/resumable')
})

test('uses the hosted storage subdomain without changing scheme or port', () => {
  expect(getResumableStorageEndpoint('https://abc.supabase.co'))
    .toBe('https://abc.storage.supabase.co/storage/v1/upload/resumable')
})
