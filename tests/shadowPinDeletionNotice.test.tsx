import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { showShadowPinDeletionNotice } from '../src/features/shadow-pin/components/shadowPinDeletionNotice'
import { retryDeletedShadowPinVideoCleanup } from '../src/features/shadow-pin/api/shadowPinApi'

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { success: jest.fn(), dismiss: jest.fn() }),
}))
jest.mock('../src/features/shadow-pin/api/shadowPinApi', () => ({ retryDeletedShadowPinVideoCleanup: jest.fn() }))

beforeEach(() => jest.clearAllMocks())

test('completed Pin removal retains the ordinary success notice', () => {
  showShadowPinDeletionNotice()
  expect(toast.success).toHaveBeenCalledWith('Pin removed')
  expect(toast).not.toHaveBeenCalled()
})

test('pending cleanup stays visibly separate from successful Pin deletion and retries only the original account/image', async () => {
  const retry = retryDeletedShadowPinVideoCleanup as jest.Mock
  retry.mockRejectedValueOnce(new Error('retained')).mockResolvedValueOnce({})
  showShadowPinDeletionNotice({ id: 'pin-1', videoCleanupPending: { imageId: 'pin-1', accountId: 'account-1' } } as never)
  const [renderNotice, options] = (toast as unknown as jest.Mock).mock.calls[0]
  expect(options).toMatchObject({ id: 'pin-video-cleanup:pin-1', duration: Infinity })
  render(renderNotice({ id: options.id }))
  expect(screen.getByText('Pin removed. Video cleanup is pending.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry video cleanup' }))
  await screen.findByText('Pin removed. Video cleanup could not finish. Retry with the same account.')
  expect(toast.dismiss).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry video cleanup' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Video cleanup finished'))
  expect(toast.dismiss).toHaveBeenCalledWith(options.id)
  expect(retry).toHaveBeenNthCalledWith(1, 'pin-1', 'account-1')
  expect(retry).toHaveBeenNthCalledWith(2, 'pin-1', 'account-1')
})
