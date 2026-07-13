import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ShadowPinFeedModeTabs } from '../src/features/shadow-pin/components/ShadowPinFeedModeTabs'

test('exposes an accessible two-mode ShadowPin tablist', () => {
  const onChange = jest.fn()
  render(<ShadowPinFeedModeTabs mode="discover" onChange={onChange} />)

  const tabs = screen.getAllByRole('tab')
  expect(screen.getByRole('tablist', { name: 'ShadowPin feed mode' })).toBeInTheDocument()
  expect(tabs).toHaveLength(2)
  expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: 'Connections' })).toHaveAttribute('aria-selected', 'false')
  expect(screen.getByRole('tab', { name: 'Discover' })).toHaveAttribute('tabindex', '0')
  expect(screen.getByRole('tab', { name: 'Connections' })).toHaveAttribute('tabindex', '-1')

  fireEvent.click(screen.getByRole('tab', { name: 'Connections' }))
  expect(onChange).toHaveBeenCalledWith('connections')
})

test('supports arrow, Home, and End keyboard selection', () => {
  const onChange = jest.fn()
  render(<ShadowPinFeedModeTabs mode="discover" onChange={onChange} />)
  const discover = screen.getByRole('tab', { name: 'Discover' })

  fireEvent.keyDown(discover, { key: 'ArrowRight' })
  fireEvent.keyDown(discover, { key: 'ArrowLeft' })
  fireEvent.keyDown(discover, { key: 'End' })
  fireEvent.keyDown(discover, { key: 'Home' })

  expect(onChange.mock.calls.map(call => call[0])).toEqual([
    'connections',
    'connections',
    'connections',
    'discover',
  ])
})

test('moves roving focus with the selected keyboard tab', () => {
  function Harness() {
    const [mode, setMode] = useState<'discover' | 'connections'>('discover')
    return <ShadowPinFeedModeTabs mode={mode} onChange={setMode} />
  }

  render(<Harness />)
  const discover = screen.getByRole('tab', { name: 'Discover' })
  discover.focus()
  fireEvent.keyDown(discover, { key: 'ArrowRight' })

  return new Promise<void>(resolve => {
    window.requestAnimationFrame(() => {
      expect(screen.getByRole('tab', { name: 'Connections' })).toHaveFocus()
      expect(screen.getByRole('tab', { name: 'Connections' })).toHaveAttribute('aria-controls', 'shadow-pin-feed-panel-connections')
      expect(screen.getByRole('tab', { name: 'Discover' })).not.toHaveAttribute('aria-controls')
      resolve()
    })
  })
})
