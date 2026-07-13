import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('ShadowPin Creator Studio entrypoint contracts', () => {
  test('ShadowPin loads Creator Studio as a separate lazy chunk', () => {
    const shadowPin = source('src/features/shadow-pin/ShadowPin.tsx')
    const importsBeforeLazyDeclaration = shadowPin.slice(0, shadowPin.indexOf('const LazyShadowPinCreatorStudio'))

    expect(shadowPin).toMatch(/const LazyShadowPinCreatorStudio = lazy\(\(\) => import\('\.\/creator'\)/)
    expect(importsBeforeLazyDeclaration).not.toMatch(/from ['"]\.\/creator['"]/)
    expect(shadowPin).toContain('<LazyShadowPinCreatorStudio')
  })

  test('chat and DM sharing route into the same lazy Studio without direct publication', () => {
    const shareModal = source('src/features/shadow-pin/components/ShareImageToShadowPinModal.tsx')

    expect(shareModal).toMatch(/lazy\(\(\) => import\('\.\.\/creator'\)/)
    expect(shareModal).toContain('<LazyShadowPinCreatorStudio')
    expect(shareModal).toContain('initialMediaUrl={imageUrl}')
    expect(shareModal).toContain("action: 'replace-viewer'")
    expect(shareModal).toContain("currentLayer: 'pin-viewer'")
    expect(shareModal).toContain("window.history.replaceState(nextState, '', mutation.url)")
    expect(shareModal).toContain("window.dispatchEvent(new PopStateEvent('popstate'")
    expect(shareModal).not.toContain('createShadowPinImage')
    expect(shareModal).not.toMatch(/from ['"]\.\.\/api\/shadowPinApi['"]/)
  })

  test('home, category, and existing-Pin edit all enter the shared Studio contract', () => {
    const shadowPin = source('src/features/shadow-pin/ShadowPin.tsx')

    expect(shadowPin).toContain('aria-label="Create Pin"')
    expect(shadowPin).toContain('aria-label="Add pin"')
    expect(shadowPin).toContain('initialCategoryId={categoryId}')
    expect(shadowPin).toContain('targetImage={creatorTargetImage}')
    expect(shadowPin).toContain('setCreatorTargetImage(image)')
    expect(shadowPin).toContain('setCreatorOpen(true)')
  })

  test('native video upload accepts nested and flattened TUS session fields', () => {
    const creatorApi = source('src/features/shadow-pin/creator/creatorApi.ts')

    expect(creatorApi).toMatch(/const session = \{\s*\.\.\.asRecord\(rawSession\.upload\),\s*\.\.\.rawSession,\s*\} as TusSession/)
    expect(creatorApi).toContain('uploadUrl: session.uploadUrl')
    expect(creatorApi).toContain('AuthorizationSignature: session.authorizationSignature')
    expect(creatorApi).toContain('bunnyVideoId: session.bunnyVideoId')
    expect(creatorApi).toContain("action: 'create-draft-upload'")
    expect(creatorApi).toContain("action: 'complete-draft-upload'")
    expect(creatorApi).toContain("action: 'delete-draft-video-asset'")
    expect(creatorApi).toContain('Videos can be up to 60 seconds.')
  })

  test('mobile footer, visual viewport, safe area, and reduced-motion behavior stay centralized', () => {
    const studio = source('src/features/shadow-pin/creator/ShadowPinCreatorStudio.tsx')
    const app = source('src/App.tsx')

    expect(app).toContain("root.style.setProperty('--shadowchat-visual-viewport-height'")
    expect(app).toContain("window.visualViewport?.addEventListener('resize'")
    expect(studio).toContain('var(--shadowchat-visual-viewport-height,100dvh)')
    expect(studio).toContain('env(safe-area-inset-bottom)')
    expect(studio).toContain("!isReducedMotion && 'animate-spin'")
    expect(studio).toContain('fixed inset-x-0 bottom-0')
  })

  test('image staging remains private until the bounded publish-preparation step', () => {
    const media = source('netlify/functions/_shared/shadow-pin-media.mjs')
    const handler = source('netlify/functions/shadow-pin-media.mjs')
    const stageBody = media.slice(
      media.indexOf('async function processCreatorDraftImageBuffer'),
      media.indexOf('export async function processShadowPinDraftImage')
    )

    expect(stageBody).toContain("state: 'ready'")
    expect(stageBody).toContain('final_image_url: null')
    expect(stageBody).not.toContain('SHADOW_PIN_BUCKET')
    expect(media).toContain('export async function prepareShadowPinDraftImagePublish')
    expect(media).toContain('export async function rollbackShadowPinDraftImagePublish')
    expect(handler).toContain("action === 'prepare-draft-image-publish'")
    expect(handler).toContain("action === 'rollback-draft-image-publish'")
  })

  test('keeps every direct Studio action at the shared mobile touch baseline', () => {
    const studio = source('src/features/shadow-pin/creator/ShadowPinCreatorStudio.tsx')

    expect(studio).toMatch(/Creator Studio steps[\s\S]*?className=\{cn\('min-h-(?:11|12)\b/)
    expect(studio).toMatch(/className="[^"]*min-h-(?:11|12)\b[^"]*"[^>]*>Use different media/)
  })

  test('drains metadata autosaves before revision-guarded media staging', () => {
    const studio = source('src/features/shadow-pin/creator/ShadowPinCreatorStudio.tsx')
    const stageStart = studio.indexOf('const stageMedia = useCallback')
    const stageEnd = studio.indexOf('const openAvailableDraft', stageStart)
    const stageBody = studio.slice(stageStart, stageEnd)

    expect(stageBody).toContain('await flushCurrentDraft()')
    expect(stageBody).toContain('const current = stateRef.current')
    expect(stageBody).toContain('stageCreatorDraftMedia(bundle.draft, currentValues')
    expect(stageBody).not.toContain('const bundle = await saveNow()')
  })
})
