import toast from 'react-hot-toast'
import type { ShadowPinImageDeletionResult } from '../api/shadowPinApi'
import { ShadowPinVideoCleanupRetry } from './ShadowPinVideoCleanupRetry'

export function showShadowPinDeletionNotice(image?: ShadowPinImageDeletionResult | null) {
  if (!image?.videoCleanupPending) {
    toast.success('Pin removed')
    return
  }
  const pending = image.videoCleanupPending
  toast(entry => <ShadowPinVideoCleanupRetry {...pending} toastId={entry.id} />, {
    id: `pin-video-cleanup:${pending.imageId}`, duration: Infinity,
  })
}
