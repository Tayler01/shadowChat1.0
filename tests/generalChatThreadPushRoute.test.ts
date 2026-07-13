import fs from 'node:fs'
import path from 'node:path'

describe('General Chat thread push routing', () => {
  test('routes canonical replies to their exact thread target with a legacy fallback', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/functions/send-push/index.ts'),
      'utf8'
    )

    expect(source).toContain(".from('general_chat_thread_replies')")
    expect(source).toContain('`/?view=chat&thread=${threadId}&message=${groupMessage.id}`')
    expect(source).toContain('`/?view=chat&message=${groupMessage.id}`')
    expect(source).toContain('threadId,')
  })
})
