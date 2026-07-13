import { fireEvent, render, screen, within } from '@testing-library/react'
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

test('keeps truthful iPhone guidance and the Android video outside scrollable details', () => {
  render(<PhoneInstallGuide {...defaultProps} />)

  expect(screen.getByRole('dialog', { name: /add shadow chat and turn on alerts/i })).toHaveClass(
    'h-[100dvh]',
    'rounded-none'
  )

  const videoStage = screen.getByTestId('phone-install-video-stage')
  expect(videoStage).toHaveClass('shrink-0')
  expect(videoStage).not.toHaveClass('overflow-y-auto')

  expect(screen.getByText('Follow the iPhone steps below.')).toBeInTheDocument()
  expect(screen.queryByLabelText('Android setup video')).not.toBeInTheDocument()
  const mobileDetails = screen.getByTestId('phone-install-scroll-details')
  expect(mobileDetails).toHaveClass('overflow-y-auto')
  expect(within(mobileDetails).getByText('1. Open Safari')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Android' }))
  expect(screen.getByLabelText('Android setup video')).toHaveClass('h-full', 'w-full')
  expect(screen.getByTestId('phone-install-video-stage')).toHaveClass('flex-1', 'items-center', 'justify-center')
  expect(screen.getByTestId('phone-install-scroll-details')).toHaveClass('overflow-y-auto')
  expect(screen.getByTestId('phone-install-scroll-details-desktop')).toHaveClass('overflow-y-auto')
})
