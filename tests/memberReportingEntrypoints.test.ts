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
    expect(content).toContain("type PinQuickAction = 'heart' | 'share' | 'comment' | 'open' | 'edit' | 'delete' | 'report'")
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

  test('Shado Live exposes room, participant, and message reports with self-report guards', () => {
    const stage = source('src/features/entertainment/shado-live/real/ShadoLiveStage.tsx')
    const messageRow = source('src/features/entertainment/shado-live/real/ShadoLiveMessageRow.tsx')
    expect(stage).toContain("type: 'live_room'")
    expect(stage).toContain("type: 'live_participant'")
    expect(stage).toContain("type: 'live_message'")
    expect(stage).toContain('Report this room')
    expect(messageRow).toContain("label: 'Report message'")
    expect(stage).toContain('participant.userId === currentUserId')
    expect(messageRow).toContain('message.senderId === currentUserId')
    expect(stage).toContain('!isHost')
  })

  test('Live notifications use the unified coordinator while the operator center stays behind the real-stage flag', () => {
    const app = source('src/App.tsx')
    const coordinator = source('src/features/notifications/notificationModel.ts')
    const preservedBridge = source('src/features/entertainment/shado-live/real/ShadoLiveNotificationBridge.tsx')
    const settings = source('src/components/settings/SettingsView.tsx')
    expect(app).not.toContain('ShadoLiveNotificationBridge')
    expect(app).toContain('NotificationCoordinatorProvider')
    expect(coordinator).toContain("case 'shado_live_room_started'")
    expect(preservedBridge).toContain('export function ShadoLiveNotificationBridge')
    expect(settings).toContain("React.lazy(() => import('../../features/moderation/ShadoLiveCaseCenter'))")
    expect(settings).toMatch(/SHADO_LIVE_REAL_ENABLED && ShadoLiveCaseCenter/)
  })

  test('the paused-build guard permits only the live report sheet for real Shado Live', () => {
    const content = source('scripts/verify-paused-feature-build.mjs')
    expect(content).toContain("feature: 'Member report sheet'")
    expect(content).toContain("isEnabled('VITE_FEATURE_MEMBER_REPORTING') || isEnabled('VITE_FEATURE_SHADO_LIVE_REAL')")
    expect(content).toContain("feature: 'My safety reports'")
    expect(content).toContain('filenamePatterns: [/myreportspanel/iu]')
  })
})
