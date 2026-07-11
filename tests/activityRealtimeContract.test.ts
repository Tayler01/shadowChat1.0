import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src', 'features', 'activity', 'ActivityProvider.tsx'),
  'utf8'
)

describe('Activity realtime contract', () => {
  test('relies on recipient RLS and a client recipient guard without the rejected server filter', () => {
    expect(source).toMatch(/event: 'INSERT', schema: 'public', table: 'activity_events'\s*}/)
    expect(source).toMatch(/event: 'UPDATE', schema: 'public', table: 'activity_events'\s*}/)
    expect(source).not.toMatch(/table: 'activity_events', filter:/)
    expect(source.match(/payload\.new\.user_id !== userId/g)).toHaveLength(2)
  })

  test('reconciles authoritatively and suppresses duplicate realtime rows', () => {
    expect(source).toMatch(/knownEventIdsRef\.current\.has\(event\.id\)/)
    expect(source).toMatch(/useRealtimeRecovery\(recoverActivity\)/)
    expect(source).toMatch(/fetchPage\(\{ silent: true }\)/)
  })
})
