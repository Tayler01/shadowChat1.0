import { forwardRef, type ImgHTMLAttributes } from 'react'
import { usePrivateMediaUrl } from '../../hooks/usePrivateMediaUrl'

type PrivateMediaImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'srcSet'>

/** Resolve protected storage at the rendering boundary, keeping persisted URLs durable. */
export const PrivateMediaImage = forwardRef<HTMLImageElement, PrivateMediaImageProps>(
  function PrivateMediaImage({ src, ...props }, ref) {
    const resolvedSrc = usePrivateMediaUrl(src)
    return <img {...props} ref={ref} src={resolvedSrc} />
  }
)
