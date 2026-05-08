import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Avatar } from '../src/components/ui/Avatar'

test('renders conventional online presence color on avatar indicator', () => {
  render(<Avatar alt="Alice Example" status="online" showStatus />)

  const indicator = screen.getByRole('img', { name: /online status/i })
  expect(indicator.className).toContain('bg-[#22c55e]')
})

test('renders conventional busy presence color on avatar indicator', () => {
  render(<Avatar alt="Alice Example" status="busy" showStatus />)

  const indicator = screen.getByRole('img', { name: /busy status/i })
  expect(indicator.className).toContain('bg-[#ef4444]')
})

test('reserves avatar image dimensions and retries when the source changes', async () => {
  const { rerender } = render(
    <Avatar src="https://example.com/broken.png" alt="Alice Example" size="lg" />
  )

  const image = screen.getByAltText('Alice Example')
  expect(image).toHaveAttribute('width', '48')
  expect(image).toHaveAttribute('height', '48')
  expect(image).toHaveAttribute('loading', 'lazy')
  expect(image).toHaveAttribute('decoding', 'async')

  fireEvent.error(image)
  expect(screen.getByText('AE')).toBeInTheDocument()

  rerender(<Avatar src="https://example.com/avatar.png" alt="Alice Example" size="lg" />)

  await waitFor(() => {
    expect(screen.getByAltText('Alice Example')).toHaveAttribute(
      'src',
      'https://example.com/avatar.png'
    )
  })
})
