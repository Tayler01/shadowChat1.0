import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('member reporting entry points', () => {
  test.each([
    ['General Chat message', 'src/components/chat/MessageItem.tsx', "type: 'general_message'", 'Report message'],
    ['direct message', 'src/components/dms/DirectMessagesView.tsx', "type: 'dm_message'", 'Report message'],
    ['member profile', 'src/components/profile/PublicProfileDialog.tsx', "type: 'user'", 'Report'],
    ['ShadowPin comment', 'src/features/shadow-pin/components/ShadowPinCommentsDialog.tsx', "type: 'shadow_pin_comment'", 'Report'],
  ])('%s remains wired to the shared private report sheet', (_label, file, targetType, actionLabel) => {
    const content = source(file)
    expect(content).toContain('useModerationReport')
    expect(content).toContain(targetType)
    expect(content).toContain(actionLabel)
  })

  test('ShadowPin posts expose Report in the long-press radial control', () => {
    const content = source('src/features/shadow-pin/ShadowPin.tsx')
    expect(content).toContain("type PinQuickAction = 'heart' | 'share' | 'comment' | 'open' | 'edit' | 'report'")
    expect(content).toContain("pinArcAction('report', 'Report'")
    expect(content).toContain("type: 'shadow_pin_image'")
    expect(content).toContain("if (action === 'report')")
  })

  test('the provider wraps the app once and lazy-loads report intake', () => {
    const main = source('src/main.tsx')
    const provider = source('src/features/moderation/ModerationReportProvider.tsx')
    expect(main).toContain('<ModerationReportProvider>')
    expect(provider).toContain("React.lazy(() =>")
    expect(provider).toContain("import('./MemberReportSheet')")
  })
})
