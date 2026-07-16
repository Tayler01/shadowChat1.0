import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const assetsDir = path.join(rootDir, 'dist', 'assets')
const isEnabled = name => (process.env[name] || '').trim().toLowerCase() === 'true'

const checks = [
  {
    feature: 'Boards and News',
    enabled: isEnabled('VITE_FEATURE_BOARDS'),
    filenamePatterns: [/board/iu, /news/iu],
    contentPatterns: [
      'get_board_badge_counts',
      'news_feed_items',
      'art_board_reactions',
      'News Sources',
    ],
  },
  {
    feature: 'ESP admin',
    enabled: isEnabled('VITE_FEATURE_ESP_ADMIN'),
    filenamePatterns: [/bridgepairing/iu],
    contentPatterns: [
      'bridge-pairing-approve',
      'ESP Bridge Pairing',
    ],
  },
  {
    feature: 'Activity HQ',
    enabled: isEnabled('VITE_FEATURE_ACTIVITY'),
    filenamePatterns: [/activityview/iu, /activityprovider/iu],
    contentPatterns: [
      'Unified Activity',
      'Mark all activity as read',
    ],
  },
  {
    feature: 'Member report sheet',
    enabled: isEnabled('VITE_FEATURE_MEMBER_REPORTING') || isEnabled('VITE_FEATURE_SHADO_LIVE_REAL'),
    filenamePatterns: [/memberreportsheet/iu],
    contentPatterns: [
      'Submit safety report',
    ],
  },
  {
    feature: 'My safety reports',
    enabled: isEnabled('VITE_FEATURE_MEMBER_REPORTING'),
    filenamePatterns: [/myreportspanel/iu],
    contentPatterns: [
      'My Safety Reports',
    ],
  },
  {
    feature: 'Shado Live prototype',
    enabled: isEnabled('VITE_FEATURE_SHADO_LIVE_PROTOTYPE'),
    filenamePatterns: [/shadoliveprototype/iu],
    contentPatterns: [
      'Leave Shado Live preview',
      'Nothing is broadcast, saved, or sent',
    ],
  },
  {
    feature: 'Shado Live real rooms',
    enabled: isEnabled('VITE_FEATURE_SHADO_LIVE_REAL'),
    filenamePatterns: [/shadoliveexperience/iu, /vendor-livekit/iu],
    contentPatterns: [
      'shado-live-session',
      'shado-live-command',
      'AudioPlaybackStatusChanged',
    ],
  },
  {
    feature: 'Catch-Up',
    enabled: isEnabled('VITE_FEATURE_CATCH_UP'),
    filenamePatterns: [/catchupview/iu],
    contentPatterns: [
      'Your Catch-Up',
      'get_my_catch_up_v1',
      'Source-linked / No AI',
    ],
  },
]

const filenames = await fs.readdir(assetsDir)
const javascriptFiles = filenames.filter(filename => filename.endsWith('.js'))
const javascript = await Promise.all(
  javascriptFiles.map(async filename => ({
    filename,
    content: await fs.readFile(path.join(assetsDir, filename), 'utf8'),
  }))
)

const failures = []

for (const check of checks) {
  if (check.enabled) continue

  for (const pattern of check.filenamePatterns) {
    const matches = filenames.filter(filename => pattern.test(filename))
    if (matches.length > 0) {
      failures.push(`${check.feature}: emitted paused chunk(s): ${matches.join(', ')}`)
    }
  }

  for (const pattern of check.contentPatterns) {
    const matches = javascript
      .filter(asset => asset.content.includes(pattern))
      .map(asset => asset.filename)
    if (matches.length > 0) {
      failures.push(`${check.feature}: found ${JSON.stringify(pattern)} in ${matches.join(', ')}`)
    }
  }
}

if (failures.length > 0) {
  console.error('Paused feature build verification failed:')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exitCode = 1
} else {
  console.log('Paused feature build verification passed.')
}
