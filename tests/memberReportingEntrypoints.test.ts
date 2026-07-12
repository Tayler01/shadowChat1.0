import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('member reporting entry points', () => {
  test.each([
    ['General Chat message', 'src/components/chat/MessageItem.tsx', "type: 'general_message'", 'Report message'],
    ['direct message', 'src/components/dms/DirectMessagesView.tsx', "type: 'dm_message'", 'Report message'],
    ['member profile', 'src/components/profile/PublicProfileDialog.tsx', "type: 'user'", 'Report'],
    ['ShadowPin comment', 'src/features/shadow-pin/components/ShadowPinCommentsDialog.tsx', "type: 'shadow_pin_comment'", 'Report'],
  ])('%s keeps dormant report wiring behind the shared feature flag', (_label, file, targetType, actionLabel) => {
    const content = source(file)
    expect(content).toContain('useModerationReport')
    expect(content).toContain(targetType)
    expect(content).toContain(actionLabel)
    expect(content).toContain('MEMBER_REPORTING_FEATURE_ENABLED')
  })

  test('ShadowPin posts preserve dormant Report wiring while the feature flag removes it from the radial control', () => {
    const content = source('src/features/shadow-pin/ShadowPin.tsx')
    expect(content).toContain("type PinQuickAction = 'heart' | 'share' | 'comment' | 'open' | 'edit' | 'report'")
    expect(content).toContain("pinArcAction('report', 'Report'")
    expect(content).toContain("type: 'shadow_pin_image'")
    expect(content).toContain("if (action === 'report')")
    expect(content).toContain('MEMBER_REPORTING_FEATURE_ENABLED && Boolean')
  })

  test('the provider remains available but only wraps the app when reporting is enabled', () => {
    const main = source('src/main.tsx')
    const provider = source('src/features/moderation/ModerationReportProvider.tsx')
    expect(main).toContain('<ModerationReportProvider>')
    expect(main).toContain('MEMBER_REPORTING_FEATURE_ENABLED')
    expect(main).toContain("lazy(() => import('./features/moderation/ModerationReportProvider')")
    expect(provider).toContain("React.lazy(() =>")
    expect(provider).toContain("import('./MemberReportSheet')")
  })
})
