import { supabase, uploadChatVideoAsset } from '../src/lib/supabase'
import { optimizeImageFile } from '../src/lib/imageOptimization'

const mockTusUpload = jest.fn()
const mockTusAbort = jest.fn(async () => undefined)
let mockCompleteUpload = true

jest.mock('../src/lib/imageOptimization', () => ({ optimizeImageFile: jest.fn() }))
jest.mock('tus-js-client', () => ({
  Upload: function MockUpload(file: File, options: {
    onSuccess: () => void
    onProgress: (uploaded: number, total: number) => void
  }) {
    mockTusUpload(file, options)
    return {
      abort: mockTusAbort,
      start: () => {
        options.onProgress(1, 2)
        if (mockCompleteUpload) options.onSuccess()
      },
    }
  },
}))

const mockStorageUpload = jest.fn(async () => ({ error: null }))
const mockPublicUrl = jest.fn((path: string) => ({ data: { publicUrl: `https://example.test/${path}` } }))

beforeEach(() => {
  jest.clearAllMocks()
  mockCompleteUpload = true
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null })
  supabase.storage.from.mockReturnValue({ upload: mockStorageUpload, getPublicUrl: mockPublicUrl })
})

test('small video retains original bytes and inferred MIME in account-owned storage', async () => {
  const file = new File(['original video bytes'], 'clip.MOV', { type: '' })
  const asset = await uploadChatVideoAsset(file)
  expect(supabase.storage.from).toHaveBeenCalledWith('chat-uploads')
  expect(mockStorageUpload).toHaveBeenCalledWith(
    expect.stringMatching(/^user-1\/.*_clip.mov$/),
    file,
    { contentType: 'video/quicktime', cacheControl: '31536000' },
  )
  expect(asset.publicUrl).toBe(`https://example.test/${asset.path}`)
  expect(optimizeImageFile).not.toHaveBeenCalled()
  expect(mockTusUpload).not.toHaveBeenCalled()
})

test('progress-enabled video uses the existing resumable contract', async () => {
  const file = new File(['video'], 'clip.mp4', { type: 'application/octet-stream' })
  const onProgress = jest.fn()
  const asset = await uploadChatVideoAsset(file, { onProgress })
  expect(mockTusUpload).toHaveBeenCalledWith(file, expect.objectContaining({
    chunkSize: 6 * 1024 * 1024,
    headers: expect.objectContaining({ 'x-upsert': 'false' }),
    metadata: { bucketName: 'chat-uploads', objectName: asset.path, contentType: 'video/mp4', cacheControl: '31536000' },
  }))
  expect(onProgress.mock.calls.map(call => call[0])).toEqual([50, 100])
  expect(mockStorageUpload).not.toHaveBeenCalled()
})

test('canceled video aborts resumable transfer without returning a publishable asset', async () => {
  mockCompleteUpload = false
  const controller = new AbortController()
  const pending = uploadChatVideoAsset(new File(['video'], 'clip.webm', { type: 'video/webm' }), { signal: controller.signal })
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  controller.abort()
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  expect(mockTusAbort).toHaveBeenCalledWith(true)
  expect(mockPublicUrl).not.toHaveBeenCalled()
})

test('rejects unsupported video formats before authentication or storage access', async () => {
  await expect(uploadChatVideoAsset(new File(['video'], 'clip.avi', { type: 'video/x-msvideo' }))).rejects.toThrow('Video must be')
  expect(supabase.auth.getUser).not.toHaveBeenCalled()
  expect(supabase.storage.from).not.toHaveBeenCalled()
})
