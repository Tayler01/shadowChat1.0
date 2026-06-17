import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'

const scriptPath = join(process.cwd(), 'scripts/submit-daily-scan-approval-packets.mjs')

const makeWinner = (candidateId: string, category: string) => ({
  candidateId,
  category,
  title: `${candidateId} approval candidate`,
  summary: `Summary for ${candidateId}`,
  evidence: [`Evidence for ${candidateId}`],
  riskNotes: 'Low-risk local implementation.',
  proposedScope: 'One candidate implementation scope.',
  verificationPlan: 'Run targeted Jest and combined release checks.',
  generatedPrompt: `Implement ${candidateId} only after approval.`,
})

describe('daily scan approval packet submitter', () => {
  let tempDir = ''

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = ''
    }
  })

  it('converts exactly five category winners into dry-run approval packets', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'daily-scan-packets-'))
    const inputPath = join(tempDir, 'winners.json')
    writeFileSync(inputPath, JSON.stringify({
      runId: 'shadowchat-daily-improvement-scan-2026-06-17',
      scanDate: '2026-06-17',
      winners: [
        makeWinner('SEC-001', 'security/auth/RLS/secrets'),
        makeWinner('PERF-001', 'performance/reliability/realtime'),
        makeWinner('DB-001', 'Supabase/database/migrations'),
        makeWinner('UX-001', 'mobile UX/PWA polish'),
        makeWinner('FEATURE-001', 'product features/high-impact improvements'),
      ],
    }))

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--input',
      inputPath,
      '--dry-run',
      '--json',
    ], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output).toMatchObject({ mode: 'dry-run', packetCount: 5 })
    expect(output.packets).toHaveLength(5)
    expect(output.packets[0]).toMatchObject({
      packet_type: 'scan',
      status: 'ready_for_review',
      candidate_id: 'SEC-001',
      category: 'security/auth/RLS/secrets',
      source_key: 'daily-scan:shadowchat-daily-improvement-scan-2026-06-17:security-auth-rls-secrets:sec-001',
    })
    expect(output.packets.every((packet: { metadata: { categoryWinner: boolean } }) => packet.metadata.categoryWinner)).toBe(true)
  })

  it('refuses partial winner batches', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'daily-scan-packets-'))
    const inputPath = join(tempDir, 'winners.json')
    writeFileSync(inputPath, JSON.stringify({
      winners: [
        makeWinner('SEC-001', 'security/auth/RLS/secrets'),
      ],
    }))

    const result = spawnSync(process.execPath, [
      scriptPath,
      '--input',
      inputPath,
      '--dry-run',
      '--json',
    ], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Expected exactly 5 winners')
  })
})
