import { forwardRef, type IframeHTMLAttributes } from 'react'
import { usePrivateMediaUrl } from '../../hooks/usePrivateMediaUrl'
import { PRIVATE_MEDIA_ENABLED } from '../../lib/privateMediaUrls'

/** A missing source stays blank while authorization is pending or denied. */
export const PrivateMediaFrame = forwardRef<HTMLIFrameElement, IframeHTMLAttributes<HTMLIFrameElement>>(
  PRIVATE_MEDIA_ENABLED ? function SignedMediaFrame({ src, ...props }, ref) {
    const source = usePrivateMediaUrl(src)
    return <iframe {...props} ref={ref} src={source} />
  } : function PublicMediaFrame(props, ref) { return <iframe {...props} ref={ref} /> }
)
