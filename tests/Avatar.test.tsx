import { render, screen } from '@testing-library/react'
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
