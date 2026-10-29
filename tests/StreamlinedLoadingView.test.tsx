import { render, screen } from '@testing-library/react'
import { StreamlinedLoadingView } from '../src/streamlined/components/StreamlinedLoadingView'

test('account loading has a stable green-track progress element without invented percentages', () => {
  const { rerender, container } = render(<StreamlinedLoadingView fullscreen message="Checking your account" />)
  const bar = screen.getByRole('progressbar', { name: 'Checking your account' })
  expect(bar).not.toHaveAttribute('aria-valuenow')
  expect(bar).toHaveAttribute('aria-valuetext', 'Loading')
  expect(container.querySelector('.streamlined-loading--fullscreen')).toBeTruthy()
  rerender(<StreamlinedLoadingView fullscreen message="Checking your membership" />)
  expect(screen.getByRole('progressbar', { name: 'Checking your membership' })).toBe(bar)
  expect(screen.queryByText(/\d+%/)).toBeNull()
})

test('lazy-view fallback is compact; failures remain actionable text rather than indefinite progress', () => {
  const { rerender, container } = render(<StreamlinedLoadingView />)
  expect(container.querySelector('.streamlined-loading--compact')).toBeTruthy()
  expect(container.querySelector('.streamlined-loading--fullscreen')).toBeNull()
  rerender(<StreamlinedLoadingView fullscreen error="Connection interrupted. Try again." />)
  expect(screen.queryByRole('progressbar')).toBeNull()
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false')
  expect(screen.getByText('Connection interrupted. Try again.')).toBeVisible()
})
