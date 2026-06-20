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

  it('extracts panel-decided winners from daily scan category output', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'daily-scan-packets-'))
    const inputPath = join(tempDir, 'scan-output.json')
    writeFileSync(inputPath, JSON.stringify({
      runId: 'shadowchat-daily-improvement-scan-2026-06-20',
      scanDate: '2026-06-20',
      categories: [
        {
          category: 'security/auth/RLS/secrets',
          topFive: [
            makeWinner('SEC-001', 'security/auth/RLS/secrets'),
            makeWinner('SEC-002', 'security/auth/RLS/secrets'),
          ],
          panelDecision: {
            winner: 'SEC-001',
            summary: 'Security panel chose the narrow bridge hardening candidate.',
            arguments: [
              { stance: 'Security risk', argument: 'Direct service-role write exposure.' },
              { stance: 'Verification confidence', argument: 'Function source contract is easy to prove.' },
            ],
          },
          rejectedTemptingCandidate: { candidateId: 'SEC-002', title: 'Redeploy stale functions' },
        },
        {
          category: 'performance/reliability/realtime',
          candidates: [makeWinner('PERF-004', 'performance/reliability/realtime')],
          panelDecidedWinner: { candidateId: 'PERF-004' },
        },
        {
          category: 'Supabase/database/migrations',
          rankedCandidates: [makeWinner('DB-002', 'Supabase/database/migrations')],
          panelWinnerId: 'DB-002',
        },
        {
          category: 'mobile UX/PWA polish',
          top5: [makeWinner('UX-001', 'mobile UX/PWA polish')],
          panel_decision: { candidate_id: 'UX-001' },
        },
        {
          category: 'product features/high-impact improvements',
          topCandidates: [makeWinner('FEATURE-005', 'product features/high-impact improvements')],
          selectedCandidateId: 'FEATURE-005',
        },
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
    expect(output.packets.map((packet: { candidate_id: string }) => packet.candidate_id)).toEqual([
      'SEC-001',
      'PERF-004',
      'DB-002',
      'UX-001',
      'FEATURE-005',
    ])
    expect(output.packets[0].metadata).toMatchObject({
      sourceFormat: 'daily-scan-output',
      sourceCandidateCount: 2,
      panelDecisionSummary: 'Security panel chose the narrow bridge hardening candidate.',
    })
    expect(output.packets[0].metadata.panelArguments).toContain('Security risk: Direct service-role write exposure.')
    expect(output.packets[0].review_markdown).toContain('## Panel Arguments')
    expect(output.packets[0].review_markdown).toContain('## Rejected Tempting Candidate')
    expect(output.packets[0].review_markdown).toContain('SEC-002')
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

  it('refuses scan output when a panel winner is not in that category', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'daily-scan-packets-'))
    const inputPath = join(tempDir, 'scan-output.json')
    writeFileSync(inputPath, JSON.stringify({
      categories: [
        {
          category: 'security/auth/RLS/secrets',
          topFive: [makeWinner('SEC-001', 'security/auth/RLS/secrets')],
          panelDecision: { winner: 'SEC-404' },
        },
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
    expect(result.stderr).toContain('panel winner SEC-404 was not found')
  })
})
