import {
  cleanText,
  createAdminClient,
  createImportedShadowPinItem,
  authenticateRequest,
  processShadowPinRow,
} from './_shared/shadow-pin-media.mjs'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  })

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  try {
    const admin = createAdminClient()
    const user = await authenticateRequest(request, admin)
    if (!user) {
      return json({ error: 'Authentication required.' }, 401)
    }

    const body = await request.json()
    const action = body?.action

    if (action === 'process-existing') {
      const targetType = body?.targetType
      const id = typeof body?.id === 'string' ? body.id : ''
      if (!id) return json({ error: 'Image record is required.' }, 400)

      const item = await processShadowPinRow({
        admin,
        targetType,
        id,
        userId: user.id,
        requireOwnership: true,
      })
      return json({ ok: true, item })
    }

    if (action === 'create-category-from-url' || action === 'create-image-from-url') {
      const targetType = action === 'create-category-from-url' ? 'category' : 'image'
      const title = cleanText(body?.title, targetType === 'category' ? 60 : 80, 'Title', true)
      const description = cleanText(body?.description, targetType === 'category' ? 300 : 500, 'Description', false)
      const item = await createImportedShadowPinItem({
        admin,
        userId: user.id,
        targetType,
        categoryId: body?.categoryId,
        title,
        description,
        url: body?.url,
      })

      return json(targetType === 'category'
        ? { ok: true, category: item }
        : { ok: true, image: item })
    }

    return json({ error: 'Unsupported ShadowPin media action.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ShadowPin media processing failed.'
    return json({ error: message }, 400)
  }
}

export const config = {
  path: '/api/shadow-pin/media',
}
