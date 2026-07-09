import {
  AVATAR_UPLOAD_MAX_BYTES,
  AVATAR_UPLOAD_RULE,
  CHAT_FILE_UPLOAD_RULE,
  CHAT_UPLOAD_MAX_BYTES,
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
})
