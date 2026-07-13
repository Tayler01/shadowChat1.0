import {
  createAdminClient,
  recoverExpiredShadowPinImagePromotions,
} from './_shared/shadow-pin-media.mjs'

export default async () => {
  try {
    const result = await recoverExpiredShadowPinImagePromotions(createAdminClient(), 50)
    return Response.json({ ok: result.failures.length === 0, ...result })
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : 'ShadowPin promotion recovery failed.',
    }, { status: 500 })
  }
}

export const config = {
  schedule: '*/10 * * * *',
}
