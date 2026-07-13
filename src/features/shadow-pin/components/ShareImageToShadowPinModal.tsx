import { lazy, Suspense } from 'react'
import toast from 'react-hot-toast'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { resolvePinRouteMutation } from '../../../lib/appRouting'

const LazyShadowPinCreatorStudio = lazy(() => import('../creator').then(module => ({
  default: module.ShadowPinCreatorStudio,
})))

const routeToPublishedPin = (imageId: string) => {
  if (typeof window === 'undefined') return
  const mutation = resolvePinRouteMutation({
    currentUrl: new URL(window.location.href),
    currentLayer: null,
    action: 'replace-viewer',
    imageId,
  })
  if (!mutation || mutation.method === 'back') return
  const nextState = { ...(window.history.state ?? {}), shadowchatLayer: mutation.layer }
  window.history.replaceState(nextState, '', mutation.url)
  window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }))
}

type ShareImageToShadowPinModalProps = {
  open: boolean
  imageUrl: string
  previewUrl?: string | null
  onClose: () => void
}

export function ShareImageToShadowPinModal({
  open,
  imageUrl,
  onClose,
}: ShareImageToShadowPinModalProps) {
  if (!open) return null

  return (
    <Suspense fallback={(
      <div className="fixed inset-0 z-[138] flex items-center justify-center bg-[var(--bg-app)]" aria-label="Opening ShadowPin Creator Studio">
        <LoadingSpinner />
      </div>
    )}>
      <LazyShadowPinCreatorStudio
        open
        initialMediaUrl={imageUrl}
        initialTitle="Shared from ShadowChat"
        onClose={onClose}
        onPublished={async image => {
          const [categories, images] = await Promise.all([
            import('../hooks/useShadowPinCategories'),
            import('../hooks/useShadowPinImages'),
          ])
          if (image.category_id) images.invalidateShadowPinImagesCache(image.category_id)
          categories.invalidateShadowPinCategoriesCache()
          toast.success('Pin published')
          routeToPublishedPin(image.id)
        }}
      />
    </Suspense>
  )
}
