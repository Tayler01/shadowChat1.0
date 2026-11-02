import { forwardRef, type ImgHTMLAttributes } from 'react'
import { usePrivateMediaUrl } from '../../hooks/usePrivateMediaUrl'
import { isUnavailableKlipyUrl, KLIPY_UNAVAILABLE_LABEL } from '../../lib/klipyAvailability'

type PrivateMediaImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'srcSet'>

/** Resolve protected storage at the rendering boundary, keeping persisted URLs durable. */
export const PrivateMediaImage = forwardRef<HTMLImageElement, PrivateMediaImageProps>(
  function PrivateMediaImage({ src, ...props }, ref) {
    const resolvedSrc = usePrivateMediaUrl(src)
    if (isUnavailableKlipyUrl(src)) {
      return <span role="img" aria-label={KLIPY_UNAVAILABLE_LABEL} data-unavailable-media="gif" className={`inline-flex items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-panel)] bg-[var(--bg-panel)] p-2 text-center text-xs text-[var(--text-muted)] ${props.className ?? ''}`}>{KLIPY_UNAVAILABLE_LABEL}</span>
    }
    return <img {...props} ref={ref} src={resolvedSrc} />
  }
)
