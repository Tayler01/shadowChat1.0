import fs from 'node:fs'
import path from 'node:path'

const handlerPath = path.resolve(process.cwd(), 'netlify/functions/shadow-pin-media.mjs')
const sharedPath = path.resolve(process.cwd(), 'netlify/functions/_shared/shadow-pin-media.mjs')
const janitorPath = path.resolve(process.cwd(), 'netlify/functions/shadow-pin-publish-janitor.mjs')
const videoFunctionPath = path.resolve(process.cwd(), 'supabase/functions/shadow-pin-video/index.ts')

const handlerSource = fs.readFileSync(handlerPath, 'utf8')
const sharedSource = fs.readFileSync(sharedPath, 'utf8')
const janitorSource = fs.readFileSync(janitorPath, 'utf8')
const videoFunctionSource = fs.readFileSync(videoFunctionPath, 'utf8')

describe('ShadowPin Creator Studio image media contract', () => {
  test('keeps generated draft media private until explicit publish preparation', () => {
    expect(sharedSource).toContain("state: 'ready', thumbnail_path: privateThumb, medium_path: privateMedium")
    expect(sharedSource).toContain('final_image_url: null, final_image_path: null')
    expect(sharedSource).toContain('export async function prepareShadowPinDraftImagePublish')
    expect(sharedSource).toContain("admin.rpc('claim_shadow_pin_image_promotion'")
    expect(handlerSource).toContain("action === 'prepare-draft-image-publish'")
    expect(sharedSource).toContain('Date.parse(data.expires_at) <= Date.now()')
    expect(sharedSource).toContain("throw new Error('Creator draft has expired.')")
  })

  test('supports publish rollback without deleting canonical media', () => {
    expect(sharedSource).toContain('export async function rollbackShadowPinDraftImagePublish')
    expect(handlerSource).toContain("action === 'rollback-draft-image-publish'")
    expect(sharedSource).toContain(".eq('creator_draft_id', draftId)")
  })

  test('checks every canonical Pin before operator cleanup removes public media', () => {
    const cleanupStart = sharedSource.indexOf('export async function deleteShadowPinDraftImageAssets')
    const cleanupSource = sharedSource.slice(cleanupStart)
    const canonicalQueryStart = cleanupSource.indexOf("admin.from('shadow_pin_images')")
    const canonicalQueryEnd = cleanupSource.indexOf('if (canonicalError)', canonicalQueryStart)
    const canonicalQuery = cleanupSource.slice(canonicalQueryStart, canonicalQueryEnd)

    expect(cleanupSource).toContain("admin.from('shadow_pin_images')")
    expect(canonicalQuery).toContain(".select('image_path,thumbnail_path,medium_path')")
    expect(canonicalQuery).not.toContain(".eq('creator_id', userId)")
    expect(cleanupSource).toContain('retainedReferencedPublicPaths')
  })

  test('publishes a staged image through one rate-limited server action', () => {
    const mediaServerSource = `${handlerSource}\n${sharedSource}`

    expect(handlerSource).toContain("action === 'publish-draft-image'")
    expect(mediaServerSource).toContain('consume_edge_request_bucket')
    expect(mediaServerSource).toContain('promotion_lease')
    expect(mediaServerSource).toMatch(/publish-draft-image[\s\S]*?rollback/i)
    expect(janitorSource).toContain('recoverExpiredShadowPinImagePromotions')
    expect(janitorSource).toMatch(/schedule:\s*['"]\*\/10 \* \* \* \*['"]/)
  })

  test('keeps native Bunny draft playback private until transactional publication', () => {
    const createStart = videoFunctionSource.indexOf('const handleCreateDraftUpload')
    const completeStart = videoFunctionSource.indexOf('const handleCompleteDraftUpload', createStart)
    const syncStart = videoFunctionSource.indexOf('const handleSyncDraftStatus', completeStart)
    const deleteStart = videoFunctionSource.indexOf('const handleDeleteDraftVideoAsset', syncStart)
    const createBody = videoFunctionSource.slice(createStart, completeStart)
    const syncBody = videoFunctionSource.slice(syncStart, deleteStart)

    expect(videoFunctionSource).toContain("'publish-draft-video'")
    for (const body of [createBody, syncBody]) {
      expect(body).toContain('video_preview_url: null')
      expect(body).toContain('video_playback_url: null')
      expect(body).toContain('video_hls_url: null')
      expect(body).toContain('video_embed_url: null')
    }
    expect(videoFunctionSource).toMatch(/publish-draft-video[\s\S]*?finalize_shadow_pin_creator_bunny_draft/)
  })
})
