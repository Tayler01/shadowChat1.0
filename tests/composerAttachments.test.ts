import { buildAttachmentMessageContent, classifyComposerFile, extractClipboardFiles } from '../src/lib/composerAttachments'
import { getMessageCaption, getMessagePreviewText } from '../src/components/chat/messageDisplay'

test.each([
  ['clip.MP4', '', 'video/mp4'],
  ['clip.mov', 'application/octet-stream', 'video/quicktime'],
  ['clip.mpg', '', 'video/mpeg'],
  ['clip.webm', 'video/webm; codecs=vp9', 'video/webm'],
])('classifies supported pasted video %s with browser MIME %s', (name, type, mimeType) => {
  expect(classifyComposerFile(new File(['video'], name, { type }))).toEqual({ kind: 'video', mimeType })
})

test('clipboard files are taken only once when browsers expose both collections', () => {
  const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
  const getAsFile = jest.fn(() => file)
  expect(extractClipboardFiles({ files: [file], items: [{ kind: 'file', getAsFile }] } as unknown as DataTransfer)).toEqual([file])
  expect(getAsFile).not.toHaveBeenCalled()
  expect(extractClipboardFiles({ files: [], items: [{ kind: 'file', getAsFile }] } as unknown as DataTransfer)).toEqual([file])
})

test.each([
  ['photo.png', 'image/png', 'image'],
  ['clip.mp4', 'video/mp4', 'video'],
  ['notes.pdf', 'application/pdf', 'file'],
] as const)('round trips caption with existing %s content format', (name, type, message_type) => {
  const file = new File(['asset'], name, { type })
  const content = buildAttachmentMessageContent(file, '  Look at this\nTogether  ')
  expect(getMessageCaption({ content, message_type })).toBe('Look at this\nTogether')
  expect(getMessagePreviewText({ id: 'm1', content, message_type })).toBe('Look at this\nTogether')
  if (message_type === 'image') expect(content).toBe('Look at this\nTogether')
  else expect(JSON.parse(content)).toEqual({ name, size: file.size, type, caption: 'Look at this\nTogether' })
})

test('keeps legacy metadata and captionless media compatible', () => {
  const file = new File(['asset'], 'clip.mp4', { type: 'video/mp4' })
  const content = buildAttachmentMessageContent(file)
  expect(JSON.parse(content)).toEqual({ name: 'clip.mp4', size: file.size, type: 'video/mp4' })
  expect(getMessagePreviewText({ id: 'm1', message_type: 'video', content })).toBe('Video')
  expect(getMessagePreviewText({ id: 'm1', message_type: 'file', content })).toBe('clip.mp4')
})

test.each(['bad json', 'null', '{"caption":42}', '{"caption":{}}'])('ignores malformed media caption %s', content => {
  expect(getMessageCaption({ message_type: 'video', content })).toBe('')
})
