
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { PrivateMediaImage } from '../src/components/ui/PrivateMediaImage'
import { PrivateMediaAudio, PrivateMediaVideo } from '../src/components/ui/PrivateMediaPlayer'
import { PrivateMediaLink } from '../src/components/ui/PrivateMediaLink'
import { PrivateMediaFrame } from '../src/components/ui/PrivateMediaFrame'
import { ImageModal } from '../apps/streamlined/src-overrides/components/ui/ImageModal'

const privatePrefix = 'https://project.supabase.co/storage/v1/object/public/'
const imageUrl = `${privatePrefix}chat-uploads/member/photo.jpg`
const videoUrl = `${privatePrefix}message-media/member/video.mp4`
const audioUrl = `${privatePrefix}chat-uploads/member/voice.webm`
const posterUrl = `${privatePrefix}shadow-pin/pin/thumb.jpg`
const mockResolvedSources = new Map<string, string>()

jest.mock('./mocks/env', () => ({
  ...jest.requireActual('./mocks/env'),
  VITE_PRIVATE_MEDIA_ENABLED: 'true',
}))

jest.mock('../src/hooks/usePrivateMediaUrl', () => ({
  usePrivateMediaUrl: (source?: string | null) => source?.includes('/storage/v1/object/public/') || source?.includes('mediadelivery.net')
    ? mockResolvedSources.get(source)
    : source || undefined,
}))

beforeEach(() => {
  mockResolvedSources.clear()
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

test('private video frames remain blank when pending/revoked and renew only to authorized sources', () => {
  const source = 'https://player.mediadelivery.net/embed/123/10000000-0000-0000-0000-000000000001'
  const ref = createRef<HTMLIFrameElement>()
  const view = render(<PrivateMediaFrame src={source} ref={ref} title="Private video" allowFullScreen />)
  expect(ref.current).not.toHaveAttribute('src')
  mockResolvedSources.set(source, `${source}?token=first&expires=1300`)
  view.rerender(<PrivateMediaFrame src={source} ref={ref} title="Private video" allowFullScreen />)
  expect(ref.current).toHaveAttribute('src', mockResolvedSources.get(source))
  mockResolvedSources.set(source, `${source}?token=renewed&expires=1600`)
  view.rerender(<PrivateMediaFrame src={source} ref={ref} title="Private video" allowFullScreen />)
  expect(ref.current).toHaveAttribute('src', mockResolvedSources.get(source))
  mockResolvedSources.delete(source)
  view.rerender(<PrivateMediaFrame src={source} ref={ref} title="Private video" allowFullScreen />)
  expect(ref.current).not.toHaveAttribute('src')
})

test('protected image previews never emit the persisted public URL while pending or denied', () => {
  const ref = createRef<HTMLImageElement>()
  const onLoad = jest.fn()
  const onError = jest.fn()
  const view = render(<PrivateMediaImage ref={ref} src={imageUrl} alt="Private photo" onLoad={onLoad} onError={onError} />)
  const image = screen.getByAltText('Private photo')
  expect(ref.current).toBe(image)
  expect(image).not.toHaveAttribute('src')

  mockResolvedSources.set(imageUrl, 'https://project.supabase.co/storage/v1/object/sign/chat-uploads/member/photo.jpg?token=first')
  view.rerender(<PrivateMediaImage ref={ref} src={imageUrl} alt="Private photo" onLoad={onLoad} onError={onError} />)
  expect(image).toHaveAttribute('src', mockResolvedSources.get(imageUrl))
  fireEvent.load(image)
  fireEvent.error(image)
  expect(onLoad).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledTimes(1)

  mockResolvedSources.delete(imageUrl)
  view.rerender(<PrivateMediaImage ref={ref} src={imageUrl} alt="Private photo" onLoad={onLoad} onError={onError} />)
  expect(image).not.toHaveAttribute('src')
})

test('the full-screen viewer resolves its full-size source and keeps zoom controls', () => {
  mockResolvedSources.set(imageUrl, 'https://project.supabase.co/signed/full-size?token=viewer')
  const view = render(<ImageModal open src={imageUrl} alt="Full-size private photo" onClose={jest.fn()} />)
  expect(screen.getByAltText('Full-size private photo')).toHaveAttribute('src', mockResolvedSources.get(imageUrl))
  expect(screen.getByRole('dialog')).toContainElement(document.querySelector('[data-zoomable-image-frame="true"]'))
  expect(screen.getByRole('button', { name: 'Close image' })).toBeInTheDocument()
  view.unmount()
})

test('a private attachment link stays non-navigable until authorized and never falls back on denial', () => {
  const onClick = jest.fn()
  const view = render(<PrivateMediaLink href={imageUrl} onClick={onClick}>Open attachment</PrivateMediaLink>)
  const link = screen.getByText('Open attachment')
  expect(link).not.toHaveAttribute('href')
  fireEvent.click(link)
  expect(onClick).not.toHaveBeenCalled()

  mockResolvedSources.set(imageUrl, 'https://project.supabase.co/signed/photo?token=link')
  view.rerender(<PrivateMediaLink href={imageUrl} onClick={onClick}>Open attachment</PrivateMediaLink>)
  expect(link).toHaveAttribute('href', mockResolvedSources.get(imageUrl))
  expect(link).not.toHaveAttribute('aria-disabled')
  mockResolvedSources.delete(imageUrl)
  view.rerender(<PrivateMediaLink href={imageUrl} onClick={onClick}>Open attachment</PrivateMediaLink>)
  expect(link).not.toHaveAttribute('href')
})

test('video and poster resolve separately, and local or external images pass through', () => {
  mockResolvedSources.set(videoUrl, 'https://project.supabase.co/signed/video?token=video')
  const view = render(<>
    <PrivateMediaVideo src={videoUrl} poster={posterUrl} aria-label="Private video" controls playsInline />
    <PrivateMediaImage src="blob:local-draft" alt="Draft" />
    <PrivateMediaImage src="https://external.example/image.jpg" alt="External" />
  </>)
  const video = screen.getByLabelText('Private video')
  expect(video).toHaveAttribute('src', mockResolvedSources.get(videoUrl))
  expect(video).not.toHaveAttribute('poster')
  expect(screen.getByAltText('Draft')).toHaveAttribute('src', 'blob:local-draft')
  expect(screen.getByAltText('External')).toHaveAttribute('src', 'https://external.example/image.jpg')

  mockResolvedSources.set(posterUrl, 'https://project.supabase.co/signed/poster?token=poster')
  view.rerender(<>
    <PrivateMediaVideo src={videoUrl} poster={posterUrl} aria-label="Private video" controls playsInline />
    <PrivateMediaImage src="blob:local-draft" alt="Draft" />
    <PrivateMediaImage src="https://external.example/image.jpg" alt="External" />
  </>)
  expect(video).toHaveAttribute('poster', mockResolvedSources.get(posterUrl))
  expect(video).toHaveAttribute('controls')
  expect(video).toHaveAttribute('playsinline')
})

test('an audio credential renewal preserves playback position, rate and playing state', () => {
  mockResolvedSources.set(audioUrl, 'https://project.supabase.co/signed/audio?token=first')
  const ref = createRef<HTMLAudioElement>()
  const view = render(<PrivateMediaAudio ref={ref} src={audioUrl} aria-label="Private recording" controls />)
  const audio = ref.current!
  audio.currentTime = 75
  audio.playbackRate = 1.25
  Object.defineProperty(audio, 'paused', { configurable: true, value: false })

  mockResolvedSources.set(audioUrl, 'https://project.supabase.co/signed/audio?token=renewed')
  view.rerender(<PrivateMediaAudio ref={ref} src={audioUrl} aria-label="Private recording" controls />)
  audio.currentTime = 0
  audio.playbackRate = 1
  fireEvent.loadedMetadata(audio)
  expect(audio.currentTime).toBe(75)
  expect(audio.playbackRate).toBe(1.25)
  expect(audio.play).toHaveBeenCalledTimes(1)
  expect(audio).toHaveAttribute('src', mockResolvedSources.get(audioUrl))
})

test('access invalidation stops playback and only restores a paused recording after reauthorization', () => {
  mockResolvedSources.set(audioUrl, 'https://project.supabase.co/signed/audio?token=first')
  const view = render(<PrivateMediaAudio src={audioUrl} aria-label="Private recording" controls />)
  const audio = screen.getByLabelText('Private recording') as HTMLAudioElement
  audio.currentTime = 42
  Object.defineProperty(audio, 'paused', { configurable: true, value: true })

  mockResolvedSources.delete(audioUrl)
  view.rerender(<PrivateMediaAudio src={audioUrl} aria-label="Private recording" controls />)
  expect(audio).not.toHaveAttribute('src')
  expect(audio.pause).toHaveBeenCalledTimes(1)
  expect(audio.load).toHaveBeenCalledTimes(1)

  mockResolvedSources.set(audioUrl, 'https://project.supabase.co/signed/audio?token=reauthorized')
  view.rerender(<PrivateMediaAudio src={audioUrl} aria-label="Private recording" controls />)
  audio.currentTime = 0
  fireEvent.loadedMetadata(audio)
  expect(audio.currentTime).toBe(42)
  expect(audio.play).not.toHaveBeenCalled()

  view.rerender(<PrivateMediaAudio src="https://external.example/different.mp3" aria-label="Private recording" controls />)
  audio.currentTime = 0
  fireEvent.loadedMetadata(audio)
  expect(audio.currentTime).toBe(0)
  expect(audio.play).not.toHaveBeenCalled()
})
