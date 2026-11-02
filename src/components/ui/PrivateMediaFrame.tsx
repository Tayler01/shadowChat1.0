import { forwardRef, type IframeHTMLAttributes } from 'react'
import { usePrivateMediaUrl } from '../../hooks/usePrivateMediaUrl'
import { PRIVATE_MEDIA_ENABLED } from '../../lib/privateMediaUrls'
import { KLIPY_GIFS_ENABLED } from '../../lib/klipyAvailability'

/** A missing source stays blank while authorization is pending or denied. */
export const PrivateMediaFrame = forwardRef<HTMLIFrameElement, IframeHTMLAttributes<HTMLIFrameElement>>(
  PRIVATE_MEDIA_ENABLED || !KLIPY_GIFS_ENABLED ? function SignedMediaFrame({ src, ...props }, ref) {
    const source = usePrivateMediaUrl(src)
    return <iframe {...props} ref={ref} src={source} />
  } : function PublicMediaFrame(props, ref) { return <iframe {...props} ref={ref} /> }
)
