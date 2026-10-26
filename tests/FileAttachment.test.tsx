
import { render, screen } from '@testing-library/react'
import { FileAttachment } from '../apps/streamlined/src-overrides/components/chat/FileAttachment'

describe('FileAttachment untrusted message handling', () => {
  test.each([
    'javascript:window.__attachmentExecuted=true',
    'data:text/html,<script>parent.__attachmentExecuted=true</script>',
    'https://user:secret@example.com/file.pdf',
    'blob:https://untrusted.example/id',
  ])('does not render an active attachment for %s', url => {
    const { container } = render(<FileAttachment url={url} meta='{"name":"report.pdf","type":"application/pdf"}' />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.querySelector('iframe,audio')).toBeNull()
    expect(screen.getByText(/unavailable attachment/)).toBeInTheDocument()
  })

  test.each(['null', '[]', '7', '{"name":{},"size":"huge","type":42}', '{"type":null}'])('tolerates hostile metadata %s', meta => {
    render(<FileAttachment url="https://example.com/document.txt" meta={meta} />)
    expect(screen.getByRole('link', { name: 'file' })).toHaveAttribute('href', 'https://example.com/document.txt')
  })

  test('sandboxes a purported PDF so an HTML response cannot execute scripts or navigate the chat', () => {
    const { container } = render(<FileAttachment url="https://example.com/report.pdf" meta='{"name":"report.pdf","type":"application/pdf"}' />)
    expect(container.querySelector('iframe')).toHaveAttribute('sandbox', 'allow-same-origin')
    expect(container.querySelector('iframe')).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('keeps audio controls and file details for a valid attachment', () => {
    const { container } = render(<FileAttachment url="https://example.com/voice.mp3" meta='{"name":"voice.mp3","type":"audio/mpeg","size":2048}' />)
    expect(container.querySelector('audio')).toHaveAttribute('src', 'https://example.com/voice.mp3')
    expect(screen.getByRole('link', { name: 'voice.mp3' })).toBeInTheDocument()
  })
})
