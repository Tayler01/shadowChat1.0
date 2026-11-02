import { fireEvent, render, screen } from '@testing-library/react'
import { PrivateMediaImage } from '../src/components/ui/PrivateMediaImage'
import { PrivateMediaLink } from '../src/components/ui/PrivateMediaLink'
import { PrivateMediaVideo } from '../src/components/ui/PrivateMediaPlayer'
import { PrivateMediaFrame } from '../src/components/ui/PrivateMediaFrame'
import { searchKlipyGifs } from '../src/lib/gifs'

const mockInvokeEdge = jest.fn()
jest.mock('../src/lib/edgeFunctions', () => ({ invokeAuthenticatedEdgeFunction: (...args: unknown[]) => mockInvokeEdge(...args) }))
jest.mock('../src/lib/klipyAvailability', () => ({
  KLIPY_GIFS_ENABLED: false,
  KLIPY_UNAVAILABLE_LABEL: 'GIF unavailable in this edition',
  isUnavailableKlipyUrl: (value?: string | null) => Boolean(value?.includes('static.klipy.com/')),
}))
jest.mock('../src/lib/privateMediaUrls', () => ({ PRIVATE_MEDIA_ENABLED: false }))

test('old provider image/link/video/frame cannot issue requests while ordinary uploaded GIFs still render', () => {
  const provider = 'https://static.klipy.com/old.gif'
  const clicked = jest.fn()
  const { container } = render(<>
    <PrivateMediaImage src={provider} alt="old shared GIF" />
    <PrivateMediaLink href={provider} onClick={clicked}>Old GIF</PrivateMediaLink>
    <PrivateMediaVideo src={provider} poster={provider} />
    <PrivateMediaFrame src={provider} />
    <PrivateMediaImage src="https://uploads.example.test/member.gif" alt="uploaded GIF" />
  </>)
  expect(screen.getByRole('img', { name: 'GIF unavailable in this edition' })).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'old shared GIF' })).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'uploaded GIF' })).toHaveAttribute('src', 'https://uploads.example.test/member.gif')
  const link = screen.getByText('Old GIF')
  expect(link).not.toHaveAttribute('href')
  fireEvent.click(link)
  expect(clicked).not.toHaveBeenCalled()
  expect(container.querySelector('video')).not.toHaveAttribute('src')
  expect(container.querySelector('video')).not.toHaveAttribute('poster')
  expect(container.querySelector('iframe')).not.toHaveAttribute('src')
})

test('a stale picker invocation does not contact the provider Edge Function', async () => {
  await expect(searchKlipyGifs({ query: 'synthetic' })).resolves.toEqual({ gifs: [], nextPage: null })
  expect(mockInvokeEdge).not.toHaveBeenCalled()
})
