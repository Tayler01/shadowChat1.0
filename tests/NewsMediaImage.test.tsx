import { fireEvent, render, screen } from '@testing-library/react'
import { NewsMediaImage } from '../src/components/news/NewsMediaImage'

test('news media image falls back from thumbnail to original media URL', () => {
  render(
    <NewsMediaImage
      media={{
        type: 'image',
        thumbnail_url: 'https://cdn.example/broken-thumb.jpg',
        url: 'https://cdn.example/full-image.jpg',
      }}
      alt="Instagram preview"
    />
  )

  const image = screen.getByAltText('Instagram preview')
  expect(image).toHaveAttribute('src', 'https://cdn.example/broken-thumb.jpg')

  fireEvent.error(image)

  expect(screen.getByAltText('Instagram preview')).toHaveAttribute('src', 'https://cdn.example/full-image.jpg')
})

test('news media image renders a stable fallback after every source fails', () => {
  render(
    <NewsMediaImage
      media={{
        type: 'image',
        thumbnail_url: 'https://cdn.example/broken-thumb.jpg',
        url: 'https://cdn.example/broken-full.jpg',
      }}
      alt="Instagram preview"
    />
  )

  fireEvent.error(screen.getByAltText('Instagram preview'))
  fireEvent.error(screen.getByAltText('Instagram preview'))

  expect(screen.getByLabelText('Instagram preview media preview unavailable')).toBeInTheDocument()
})
