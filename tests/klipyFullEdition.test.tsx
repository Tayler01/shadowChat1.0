import { render, screen } from '@testing-library/react'
import { searchKlipyGifs } from '../src/lib/gifs'
import { PrivateMediaImage } from '../src/components/ui/PrivateMediaImage'
import { PrivateMediaLink } from '../src/components/ui/PrivateMediaLink'

const mockInvoke = jest.fn()
jest.mock('../src/lib/edgeFunctions', () => ({ invokeAuthenticatedEdgeFunction: (...args: unknown[]) => mockInvoke(...args) }))
jest.mock('../src/lib/privateMediaUrls', () => ({ PRIVATE_MEDIA_ENABLED: false }))

test('the full edition keeps existing KLIPY search and media behavior', async () => {
  const url = 'https://static.klipy.com/full-edition.gif'
  const gif = { id: 'full', title: 'Full edition GIF', url, previewUrl: url }
  mockInvoke.mockResolvedValue({ gifs: [gif], nextPage: 2 })
  await expect(searchKlipyGifs({ query: ' ocean ' })).resolves.toEqual({ gifs: [gif], nextPage: 2 })
  expect(mockInvoke).toHaveBeenCalledWith('klipy-gifs', { query: 'ocean', page: 1, limit: 24 }, { signal: undefined })
  render(<><PrivateMediaImage src={url} alt="Full GIF" /><PrivateMediaLink href={url}>Full GIF source</PrivateMediaLink></>)
  expect(screen.getByRole('img', { name: 'Full GIF' })).toHaveAttribute('src', url)
  expect(screen.getByRole('link', { name: 'Full GIF source' })).toHaveAttribute('href', url)
  expect(screen.queryByText('GIF unavailable in this edition')).not.toBeInTheDocument()
})
