import {
  authenticateAuthorization,
  cleanText,
  createAdminClient,
  createImportedShadowPinItem,
  processShadowPinRowForUser,
  updateImportedShadowPinCategoryCover,
} from './_shared/shadow-pin-media.mjs'

const json = (body, statusCode = 200) => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
})

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  try {
    const admin = createAdminClient()
    const user = await authenticateAuthorization(
      event.headers?.authorization || event.headers?.Authorization || '',
      admin
    )
    if (!user) {
      return json({ error: 'Authentication required.' }, 401)
    }

    const body = JSON.parse(event.body || '{}')
    const action = body?.action

    if (action === 'process-existing') {
      const targetType = body?.targetType
      const id = typeof body?.id === 'string' ? body.id : ''
      if (!id) return json({ error: 'Image record is required.' }, 400)

      const item = await processShadowPinRowForUser({
        admin,
        targetType,
        id,
        userId: user.id,
      })
      return json({ ok: true, item })
    }

    if (action === 'update-category-cover-from-url') {
      const title = cleanText(body?.title, 60, 'Title', true)
      const description = cleanText(body?.description, 300, 'Description', false)
      const category = await updateImportedShadowPinCategoryCover({
        admin,
        userId: user.id,
        categoryId: body?.categoryId,
        title,
        description,
        url: body?.url,
      })

      return json({ ok: true, category })
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
