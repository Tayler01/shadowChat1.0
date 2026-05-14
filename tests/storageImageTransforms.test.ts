import { getSupabaseImageTransformUrl } from '../src/lib/storageImageTransforms'

test('builds Supabase backend image transformation URLs for public storage objects', () => {
  const url = getSupabaseImageTransformUrl(
    'https://example.supabase.co/storage/v1/object/public/avatars/user/avatar.jpg',
    { width: 96, height: 96, resize: 'cover', quality: 80 }
  )

  expect(url).toBe(
    'https://example.supabase.co/storage/v1/render/image/public/avatars/user/avatar.jpg?width=96&height=96&quality=80&resize=cover'
  )
})

test('does not transform animated or vector-friendly formats', () => {
  expect(getSupabaseImageTransformUrl(
    'https://example.supabase.co/storage/v1/object/public/chat-uploads/user/party.gif',
    { width: 320 }
  )).toBe('https://example.supabase.co/storage/v1/object/public/chat-uploads/user/party.gif')

  expect(getSupabaseImageTransformUrl(
    'https://example.supabase.co/storage/v1/object/public/chat-uploads/user/logo.svg',
    { width: 320 }
  )).toBe('https://example.supabase.co/storage/v1/object/public/chat-uploads/user/logo.svg')
})

test('leaves non-storage URLs unchanged', () => {
  expect(getSupabaseImageTransformUrl('https://cdn.example.com/image.jpg', { width: 320 }))
    .toBe('https://cdn.example.com/image.jpg')
})
