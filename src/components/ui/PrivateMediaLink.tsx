import { forwardRef, type AnchorHTMLAttributes } from 'react'
import { usePrivateMediaUrl } from '../../hooks/usePrivateMediaUrl'
import { PRIVATE_MEDIA_ENABLED } from '../../lib/privateMediaUrls'
import { KLIPY_GIFS_ENABLED } from '../../lib/klipyAvailability'

/** A durable attachment link only becomes navigable after access is resolved. */
export const PrivateMediaLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  PRIVATE_MEDIA_ENABLED || !KLIPY_GIFS_ENABLED ? function SignedPrivateMediaLink({ href, onClick, ...props }, ref) {
    const resolvedHref = usePrivateMediaUrl(href)
    return <a
      {...props}
      ref={ref}
      href={resolvedHref}
      aria-disabled={href && !resolvedHref ? true : props['aria-disabled']}
      onClick={event => {
        if (href && !resolvedHref) {
          event.preventDefault()
          return
        }
        onClick?.(event)
      }}
    />
  } : function PublicMediaLink(props, ref) { return <a {...props} ref={ref} /> }
)
