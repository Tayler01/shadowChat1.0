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
    expect(shareModal).toContain("window.history.replaceState(nextState, '', mutation.url)")
    expect(shareModal).toContain("window.dispatchEvent(new PopStateEvent('popstate'")
    expect(shareModal).not.toContain('createShadowPinImage')
    expect(shareModal).not.toMatch(/from ['"]\.\.\/api\/shadowPinApi['"]/)
  })

  test('native video upload accepts nested and flattened TUS session fields', () => {
    const creatorApi = source('src/features/shadow-pin/creator/creatorApi.ts')

    expect(creatorApi).toMatch(/const session = \{\s*\.\.\.asRecord\(rawSession\.upload\),\s*\.\.\.rawSession,\s*\} as TusSession/)
    expect(creatorApi).toContain('uploadUrl: session.uploadUrl')
    expect(creatorApi).toContain('AuthorizationSignature: session.authorizationSignature')
    expect(creatorApi).toContain('bunnyVideoId: session.bunnyVideoId')
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
})
