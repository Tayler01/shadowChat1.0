import {
  AVATAR_UPLOAD_MAX_BYTES,
  AVATAR_UPLOAD_RULE,
  CHAT_FILE_UPLOAD_RULE,
  CHAT_VIDEO_UPLOAD_RULE,
  CHAT_UPLOAD_MAX_BYTES,
  getUploadErrorMessage,
  resolveUploadMimeType,
  sanitizeUploadFileName,
  UploadValidationError,
  validateUpload,
} from '../src/lib/uploadLimits'

describe('upload limits', () => {
  test('sanitizes storage object names without changing the display filename', () => {
    expect(sanitizeUploadFileName('../../Quarterly report (final).PDF')).toBe(
      'Quarterly-report-final.pdf'
    )
    expect(sanitizeUploadFileName('..\\..\\🔥.exe')).toBe('attachment.exe')
    expect(sanitizeUploadFileName('.')).toBe('attachment')
  })

  test('infers a supported MIME type when the browser leaves File.type blank', () => {
    expect(resolveUploadMimeType({ name: 'notes.md', type: '' })).toBe('text/markdown')
    expect(resolveUploadMimeType({ name: 'photo.JPG', type: '' })).toBe('image/jpeg')
  })

  test('rejects unsupported profile image types with an actionable error', () => {
    const file = new File(['image'], 'avatar.svg', { type: 'image/svg+xml' })

    expect(() => validateUpload(file, AVATAR_UPLOAD_RULE)).toThrow(
      new UploadValidationError('Avatar must be a JPEG, PNG, WebP, GIF, or AVIF image.')
    )
  })

  test('rejects files above the bucket-aligned limit', () => {
    const oversized = {
      name: 'large.jpg',
      type: 'image/jpeg',
      size: AVATAR_UPLOAD_MAX_BYTES + 1,
    }

    expect(() => validateUpload(oversized, AVATAR_UPLOAD_RULE)).toThrow(
      'Avatar is too large. The maximum size is 10 MiB.'
    )
  })

  test('accepts the largest supported chat attachment boundary', () => {
    expect(validateUpload({
      name: 'archive.zip',
      type: 'application/zip',
      size: CHAT_UPLOAD_MAX_BYTES,
    }, CHAT_FILE_UPLOAD_RULE)).toBe('application/zip')
  })

  test('video uploads enforce the existing bucket MIME and size boundary', () => {
    expect(validateUpload({ name: 'clip.mov', type: '', size: CHAT_UPLOAD_MAX_BYTES }, CHAT_VIDEO_UPLOAD_RULE))
      .toBe('video/quicktime')
    expect(() => validateUpload({ name: 'clip.mp4', type: 'video/mp4', size: CHAT_UPLOAD_MAX_BYTES + 1 }, CHAT_VIDEO_UPLOAD_RULE))
      .toThrow('Video is too large. The maximum size is 64 MiB.')
    expect(() => validateUpload(new File(['image'], 'photo.png', { type: 'image/png' }), CHAT_VIDEO_UPLOAD_RULE))
      .toThrow('Video must be a MP4, MPEG, OGG, QuickTime, or WebM video.')
    expect(() => validateUpload(new File(['video'], 'clip.avi', { type: 'video/x-msvideo' }), CHAT_VIDEO_UPLOAD_RULE))
      .toThrow('Video must be a MP4, MPEG, OGG, QuickTime, or WebM video.')
  })

  test('turns upload transport and authorization failures into actionable messages', () => {
    expect(getUploadErrorMessage(new Error('TypeError: Failed to fetch'), 'Upload failed'))
      .toBe('The upload was interrupted. Check your connection and try again.')
    expect(getUploadErrorMessage(new Error('new row violates row-level security policy'), 'Upload failed'))
      .toBe('ShadowChat could not authorize this upload. Refresh the app and try again.')
  })

  test('maps TUS 413 response shapes to a safe size explanation without exposing request URLs', () => {
    const error = Object.assign(new Error('tus: request https://storage.example/upload?token=private-token, response code: 413, response text: Maximum size exceeded'), {
      originalResponse: { getStatus: () => 413 },
    })
    const message = getUploadErrorMessage(error, 'Upload failed', {
      fileSizeBytes: 35 * 1024 * 1024,
      limitBytes: CHAT_UPLOAD_MAX_BYTES,
    })
    expect(message).toContain('35 MiB')
    expect(message).toContain('64 MiB')
    expect(message).toContain('Keep it staged')
    expect(message).not.toContain('https://')
    expect(message).not.toContain('private-token')
    expect(getUploadErrorMessage({ status: 413 }, 'Upload failed')).toContain('rejected this file')
    expect(getUploadErrorMessage(new Error('Maximum size exceeded at https://storage.example?secret=abc'), 'Upload failed'))
      .not.toContain('secret=abc')
  })
})
