import fs from 'node:fs'
import path from 'node:path'

const shadowPin = fs.readFileSync(
  path.join(process.cwd(), 'src', 'features', 'shadow-pin', 'ShadowPin.tsx'),
  'utf8'
)
const tracker = fs.readFileSync(
  path.join(process.cwd(), 'src', 'features', 'shadow-pin', 'hooks', 'useShadowPinActivityTracker.ts'),
  'utf8'
)
const supabase = fs.readFileSync(
  path.join(process.cwd(), 'src', 'lib', 'supabase.ts'),
  'utf8'
)

describe('Creator Studio return and unload telemetry contracts', () => {
  test('home-origin publication closes Theater back to ShadowPin home', () => {
    expect(shadowPin).toContain('returnHomeAfterViewerClose')
    expect(shadowPin).toMatch(/onPublishedPin=\{image => \{[\s\S]*?setReturnHomeAfterViewerClose\(true\)[\s\S]*?onPinRoute\('replace-viewer', image\.id\)/)
    expect(shadowPin).toMatch(/const closeImageViewer = \(\) => \{[\s\S]*?onPinRoute\('close-viewer',[\s\S]*?onViewerClose\?\.\(\)/)
    expect(shadowPin).toMatch(/onViewerClose=\{returnHomeAfterViewerClose \? \(\) => \{[\s\S]*?setActiveCategoryId\(null\)/)
  })

  test('one background or unload wave coalesces finalization onto a keepalive request', () => {
    expect(tracker).toContain('finishingSessionRef.current === sessionId')
    expect(tracker).toContain('finishingSessionRef.current = sessionId')
    expect(tracker).toMatch(/document\.visibilityState === 'visible'[\s\S]*?finishingSessionRef\.current = null/)
    expect(supabase).toContain("/rest/v1/rpc/finish_shadow_pin_activity_session")
    expect(supabase).toMatch(/keepalive \? \{ \.\.\.init, keepalive: true \} : init/)
  })
})
