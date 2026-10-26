jest.mock('../src/lib/supabase', () => jest.requireMock('../apps/streamlined/src-overrides/lib/supabase'))
import { createRef } from 'react'
import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { PrivateMediaAudio, PrivateMediaVideo } from '../src/components/ui/PrivateMediaPlayer'
import { PrivateMediaLink } from '../src/components/ui/PrivateMediaLink'
import { PrivateMediaFrame } from '../src/components/ui/PrivateMediaFrame'
import { usePrivateMediaUrl } from '../src/hooks/usePrivateMediaUrl'
import { getWorkingClient } from '../apps/streamlined/src-overrides/lib/supabase'

jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({ getWorkingClient: jest.fn(), supabase: {} }))

test('default builds preserve native media attributes, refs and events without signing', () => {
  const audioRef = createRef<HTMLAudioElement>()
  const videoRef = createRef<HTMLVideoElement>()
  const onLoadedMetadata = jest.fn()
  render(<>
    <PrivateMediaAudio ref={audioRef} src="https://example.supabase.co/voice.webm" controls aria-label="Recording" onLoadedMetadata={onLoadedMetadata} />
    <PrivateMediaVideo ref={videoRef} src="https://example.supabase.co/video.mp4" poster="https://example.supabase.co/poster.jpg" controls playsInline aria-label="Video" />
    <PrivateMediaFrame src="https://player.mediadelivery.net/embed/123/video" title="Existing video" />
  </>)
  expect(audioRef.current).toBe(screen.getByLabelText('Recording'))
  expect(audioRef.current).toHaveAttribute('src', 'https://example.supabase.co/voice.webm')
  expect(audioRef.current).toHaveAttribute('controls')
  expect(videoRef.current).toBe(screen.getByLabelText('Video'))
  expect(videoRef.current).toHaveAttribute('src', 'https://example.supabase.co/video.mp4')
  expect(videoRef.current).toHaveAttribute('poster', 'https://example.supabase.co/poster.jpg')
  expect(videoRef.current).toHaveAttribute('playsinline')
  expect(screen.getByTitle('Existing video')).toHaveAttribute('src', 'https://player.mediadelivery.net/embed/123/video')
  fireEvent.loadedMetadata(audioRef.current!)
  expect(onLoadedMetadata).toHaveBeenCalledTimes(1)
  expect(getWorkingClient).not.toHaveBeenCalled()
})

test('default builds preserve attachment navigation handlers and forwarded refs', () => {
  const ref = createRef<HTMLAnchorElement>()
  const onClick = jest.fn(event => event.preventDefault())
  render(<PrivateMediaLink ref={ref} href="https://example.supabase.co/photo.jpg" onClick={onClick} download="photo.jpg">Download</PrivateMediaLink>)
  expect(ref.current).toBe(screen.getByRole('link', { name: 'Download' }))
  expect(ref.current).toHaveAttribute('href', 'https://example.supabase.co/photo.jpg')
  expect(ref.current).toHaveAttribute('download', 'photo.jpg')
  fireEvent.click(ref.current!)
  expect(onClick).toHaveBeenCalledTimes(1)
  expect(getWorkingClient).not.toHaveBeenCalled()
})

test('the default hook updates synchronously and still omits disabled media', () => {
  const { result, rerender } = renderHook(({ source, enabled }) => usePrivateMediaUrl(source, { enabled }), {
    initialProps: { source: 'https://example.supabase.co/one.jpg', enabled: true },
  })
  expect(result.current).toBe('https://example.supabase.co/one.jpg')
  rerender({ source: 'https://example.supabase.co/two.jpg', enabled: true })
  expect(result.current).toBe('https://example.supabase.co/two.jpg')
  rerender({ source: 'https://example.supabase.co/two.jpg', enabled: false })
  expect(result.current).toBeUndefined()
  expect(getWorkingClient).not.toHaveBeenCalled()
})
