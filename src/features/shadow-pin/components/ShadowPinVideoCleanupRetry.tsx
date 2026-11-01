import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '../../../components/ui/Button'
import { retryDeletedShadowPinVideoCleanup } from '../api/shadowPinApi'

export function ShadowPinVideoCleanupRetry({ imageId, accountId, toastId }: { imageId: string; accountId: string; toastId: string }) {
  const [retrying, setRetrying] = useState(false)
  const [failed, setFailed] = useState(false)
  const retry = async () => {
    setRetrying(true)
    try {
      await retryDeletedShadowPinVideoCleanup(imageId, accountId)
      toast.dismiss(toastId)
      toast.success('Video cleanup finished')
    } catch {
      setFailed(true)
    } finally {
      setRetrying(false)
    }
  }
  return <div className="flex flex-col gap-2">
    <span>{failed ? 'Pin removed. Video cleanup could not finish. Retry with the same account.' : 'Pin removed. Video cleanup is pending.'}</span>
    <Button variant="secondary" loading={retrying} onClick={() => void retry()}>Retry video cleanup</Button>
  </div>
}
