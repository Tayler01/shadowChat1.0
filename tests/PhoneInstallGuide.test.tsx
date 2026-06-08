import { render, screen } from '@testing-library/react'
import React from 'react'
import { PhoneInstallGuide } from '../src/components/onboarding/PhoneInstallGuide'

const defaultProps = {
  open: true,
  canInstall: false,
  onClose: jest.fn(),
  onComplete: jest.fn(),
  onInstall: jest.fn(async () => null),
}

beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: jest.fn().mockResolvedValue(undefined),
  })
})

beforeEach(() => {
  jest.clearAllMocks()
})

test('keeps the phone setup video outside the scrollable setup details', () => {
  render(<PhoneInstallGuide {...defaultProps} />)

  expect(screen.getByRole('dialog', { name: /add shadow chat and turn on alerts/i })).toHaveClass(
    'h-[100dvh]',
    'rounded-none'
  )

  const videoStage = screen.getByTestId('phone-install-video-stage')
  expect(videoStage).toHaveClass('flex-1', 'items-center', 'justify-center')
  expect(videoStage).not.toHaveClass('overflow-y-auto')

  expect(screen.getByLabelText('Phone setup video')).toHaveClass('h-full', 'w-full')
  expect(screen.getByTestId('phone-install-scroll-details')).toHaveClass('overflow-y-auto')
  expect(screen.getByTestId('phone-install-scroll-details-desktop')).toHaveClass('overflow-y-auto')
})
