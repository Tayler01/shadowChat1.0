#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const REQUIRED_WINNER_COUNT = 5
const MAX_SOURCE_KEY_LENGTH = 160

const usage = `Usage:
  npm run automation:submit-daily-scan -- --input path/to/winners.json --dry-run
  npm run automation:submit-daily-scan -- --input path/to/winners.json --apply

Input shape:
  Either normalized winners:

  {
    "runId": "shadowchat-daily-improvement-scan-2026-06-17",
    "scanDate": "2026-06-17",
    "winners": [
      {
        "candidateId": "SEC-001",
        "category": "security/auth/RLS/secrets",
        "title": "Harden AI post-to-chat service-role writes",
        "summary": "...",
        "evidence": ["..."],
        "riskNotes": "...",
        "proposedScope": "...",
        "verificationPlan": "...",
        "generatedPrompt": "..."
      }
    ]
  }

  Or daily scan category output:

  {
    "runId": "shadowchat-daily-improvement-scan-2026-06-17",
    "scanDate": "2026-06-17",
    "categories": [
      {
        "category": "security/auth/RLS/secrets",
        "topFive": [{ "candidateId": "SEC-001", "title": "..." }],
        "panelDecision": { "winner": "SEC-001", "arguments": ["..."] },
        "rejectedTemptingCandidate": { "candidateId": "SEC-003", "title": "..." }
      }
    ]
  }`

const parseArgs = (argv) => {
  const args = {
    apply: false,
    dryRun: false,
    json: false,
    input: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') {
      args.apply = true
    } else if (arg === '--dry-run') {
      args.dryRun = true
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--input') {
      args.input = argv[index + 1] ?? ''
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage)
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!args.input) {
    throw new Error('Missing required --input path')
  }

  if (args.apply && args.dryRun) {
    throw new Error('Use either --apply or --dry-run, not both')
  }

  if (!args.apply) {
    args.dryRun = true
  }

  return args
}

const asString = (value, fallback = '') => (
  typeof value === 'string' ? value.trim() : fallback
)

const truncate = (value, maxLength) => {
  const text = asString(value)
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

const slugify = (value) => asString(value, 'uncategorized')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48) || 'uncategorized'

const normalizeEvidence = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') return item
      return null
    })
    .filter(Boolean)
}

const normalizeTextList = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') {
        const stance = asString(item.stance ?? item.reviewer ?? item.name)
        const argument = asString(item.argument ?? item.summary ?? item.position ?? item.reason)
        return [stance, argument].filter(Boolean).join(': ')
      }
      return ''
    })
    .filter(Boolean)
}

const normalizeCandidateId = value => asString(value).toLowerCase()

const getCandidateId = value => asString(
  value?.candidateId ??
  value?.candidate_id ??
  value?.id ??
  value?.candidate ??
  value?.winnerId ??
  value?.winner_id,
)

const getCandidateCollections = category => [
  category?.topFive,
  category?.top5,
  category?.topCandidates,
  category?.candidates,
  category?.rankedCandidates,
  category?.ranked_candidates,
].find(Array.isArray) ?? []

const getPanelDecision = category => (
  category?.panelDecision ??
  category?.panel_decision ??
  category?.panel ??
  category?.decision ??
  {}
)

const getWinnerReference = (category, decision) => (
  category?.panelDecidedWinner ??
  category?.panel_decided_winner ??
  category?.panelWinner ??
  category?.panel_winner ??
  category?.winner ??
  category?.selectedWinner ??
  category?.selected_winner ??
  category?.selectedCandidate ??
  category?.selected_candidate ??
  category?.winnerId ??
  category?.winner_id ??
  category?.panelWinnerId ??
  category?.panel_winner_id ??
  category?.panelDecidedWinnerId ??
  category?.panel_decided_winner_id ??
  category?.selectedCandidateId ??
  category?.selected_candidate_id ??
  decision?.winner ??
  decision?.winnerId ??
  decision?.winner_id ??
  decision?.candidateId ??
  decision?.candidate_id ??
  decision?.candidate
)

const getPanelArguments = (category, decision) => normalizeTextList(
  decision?.arguments ??
  decision?.panelArguments ??
  decision?.panel_arguments ??
  category?.panelArguments ??
  category?.panel_arguments ??
  category?.panelReview ??
  category?.panel_review,
)

const findCandidateByReference = (candidates, reference) => {
  const referenceId = typeof reference === 'object' ? getCandidateId(reference) : asString(reference)
  const normalizedReferenceId = normalizeCandidateId(referenceId)
  if (!normalizedReferenceId) return null

  return candidates.find(candidate => normalizeCandidateId(getCandidateId(candidate)) === normalizedReferenceId) ?? null
}

const mergeWinnerWithCandidate = (winnerReference, matchedCandidate, categoryName, category, decision) => {
  const winnerObject = winnerReference && typeof winnerReference === 'object' ? winnerReference : {}
  const winner = {
    ...(matchedCandidate ?? {}),
    ...winnerObject,
  }

  const candidateId = getCandidateId(winner)
  if (!candidateId) {
    throw new Error(`Category ${categoryName} is missing a panel-decided winner candidateId`)
  }

  return {
    ...winner,
    candidateId,
    category: winner.category ?? categoryName,
    panelArguments: getPanelArguments(category, decision),
    panelDecisionSummary: asString(
      decision?.summary ??
      decision?.reason ??
      decision?.rationale ??
      category?.panelDecisionSummary ??
      category?.panel_decision_summary,
    ),
    rejectedTemptingCandidate: category?.rejectedTemptingCandidate ?? category?.rejected_tempting_candidate ?? category?.temptingReject ?? category?.tempting_reject ?? null,
    sourceCandidateCount: getCandidateCollections(category).length,
  }
}

const getCategoryEntries = input => {
  const rawCategories = input?.categories ?? input?.categoryResults ?? input?.category_results ?? input?.results
  if (Array.isArray(rawCategories)) return rawCategories
  if (rawCategories && typeof rawCategories === 'object') {
    return Object.entries(rawCategories).map(([category, value]) => ({
      category,
      ...(value && typeof value === 'object' ? value : { winner: value }),
    }))
  }
  return []
}

const buildWinnersFromScanOutput = input => {
  const categories = getCategoryEntries(input)
  if (!categories.length) return []

  return categories.map((category, index) => {
    const categoryName = asString(category?.category ?? category?.name ?? category?.title, `category-${index + 1}`)
    const candidates = getCandidateCollections(category)
    const decision = getPanelDecision(category)
    const winnerReference = getWinnerReference(category, decision)
    const matchedCandidate = findCandidateByReference(candidates, winnerReference)

    if (!winnerReference) {
      throw new Error(`Category ${categoryName} is missing a panel-decided winner`)
    }

    if (typeof winnerReference !== 'object' && !matchedCandidate) {
      throw new Error(`Category ${categoryName} panel winner ${winnerReference} was not found in the candidate list`)
    }

    return mergeWinnerWithCandidate(winnerReference, matchedCandidate, categoryName, category, decision)
  })
}

const normalizeDailyScanInput = input => ({
  runId: asString(input?.runId ?? input?.run_id, 'shadowchat-daily-improvement-scan'),
  scanDate: asString(input?.scanDate ?? input?.scan_date, new Date().toISOString().slice(0, 10)),
  winners: Array.isArray(input?.winners) ? input.winners : buildWinnersFromScanOutput(input),
  sourceFormat: Array.isArray(input?.winners) ? 'winners' : 'daily-scan-output',
})

const makeSourceKey = ({ runId, scanDate, winner, index }) => {
  const raw = [
    'daily-scan',
    asString(runId, asString(scanDate, 'undated')),
    slugify(winner.category),
    slugify(winner.candidateId || `winner-${index + 1}`),
  ].join(':')

  return raw.slice(0, MAX_SOURCE_KEY_LENGTH)
}

const formatMarkdownList = (items, fallback) => {
  if (!items.length) return fallback
  return items.map(item => `- ${typeof item === 'string' ? item : JSON.stringify(item)}`).join('\n')
}

const makeReviewMarkdown = ({ runId, scanDate, winner }) => [
  `# ${asString(winner.title)}`,
  '',
  `- Candidate: ${asString(winner.candidateId ?? winner.candidate_id, 'Unspecified')}`,
  `- Category: ${asString(winner.category, 'Unspecified')}`,
  `- Scan date: ${asString(scanDate, 'Unspecified')}`,
  `- Run: ${asString(runId, 'Unspecified')}`,
  '',
  '## Summary',
  asString(winner.summary, 'No summary supplied.'),
  '',
  '## Evidence',
  formatMarkdownList(normalizeEvidence(winner.evidence), 'No evidence supplied.'),
  '',
  '## Panel Arguments',
  formatMarkdownList(normalizeTextList(winner.panelArguments ?? winner.panel_arguments), 'No panel arguments supplied.'),
  '',
  '## Rejected Tempting Candidate',
  winner.rejectedTemptingCandidate ? JSON.stringify(winner.rejectedTemptingCandidate, null, 2) : 'No rejected candidate supplied.',
  '',
  '## Risk Notes',
  asString(winner.riskNotes ?? winner.risk_notes, 'No risk notes supplied.'),
  '',
  '## Proposed Scope',
  asString(winner.proposedScope ?? winner.proposed_scope, 'No proposed scope supplied.'),
  '',
  '## Verification Plan',
  asString(winner.verificationPlan ?? winner.verification_plan, 'No verification plan supplied.'),
].join('\n')

export const buildDailyScanApprovalPackets = (input) => {
  const { runId, scanDate, winners, sourceFormat } = normalizeDailyScanInput(input)

  if (winners.length !== REQUIRED_WINNER_COUNT) {
    throw new Error(`Expected exactly ${REQUIRED_WINNER_COUNT} winners, received ${winners.length}`)
  }

  const categories = new Set()
  const packets = winners.map((winner, index) => {
    const candidateId = truncate(winner?.candidateId ?? winner?.candidate_id, 80)
    const category = truncate(winner?.category, 80)
    const title = truncate(winner?.title, 180)

    if (!candidateId) throw new Error(`Winner ${index + 1} is missing candidateId`)
    if (!category) throw new Error(`Winner ${index + 1} is missing category`)
    if (title.length < 3) throw new Error(`Winner ${index + 1} title must be at least 3 characters`)

    categories.add(category)

    return {
      packet_type: 'scan',
      status: 'ready_for_review',
      candidate_id: candidateId,
      source_key: truncate(winner?.sourceKey ?? winner?.source_key, MAX_SOURCE_KEY_LENGTH) || makeSourceKey({ runId, scanDate, winner, index }),
      category,
      title,
      summary: truncate(winner?.summary, 8000),
      evidence: normalizeEvidence(winner?.evidence),
      risk_notes: truncate(winner?.riskNotes ?? winner?.risk_notes, 8000),
      proposed_scope: truncate(winner?.proposedScope ?? winner?.proposed_scope, 12000),
      generated_prompt: truncate(winner?.generatedPrompt ?? winner?.generated_prompt, 20000),
      verification_plan: truncate(winner?.verificationPlan ?? winner?.verification_plan, 12000),
      branch_name: null,
      pr_url: null,
      preview_url: null,
      artifact_url: null,
      packet_url: null,
      review_markdown: truncate(makeReviewMarkdown({ runId, scanDate, winner }), 30000),
      redacted_logs: [],
      metadata: {
        automationId: 'shadowchat-daily-improvement-scan',
        runId,
        scanDate,
        sourceFormat,
        winnerIndex: index + 1,
        categoryWinner: true,
        panelDecisionSummary: truncate(winner?.panelDecisionSummary ?? winner?.panel_decision_summary, 4000),
        panelArguments: normalizeTextList(winner?.panelArguments ?? winner?.panel_arguments),
        rejectedTemptingCandidate: winner?.rejectedTemptingCandidate ?? winner?.rejected_tempting_candidate ?? null,
        sourceCandidateCount: Number.isFinite(winner?.sourceCandidateCount) ? winner.sourceCandidateCount : null,
      },
    }
  })

  if (categories.size !== REQUIRED_WINNER_COUNT) {
    throw new Error(`Expected ${REQUIRED_WINNER_COUNT} independent winner categories, received ${categories.size}`)
  }

  const sourceKeys = new Set(packets.map(packet => packet.source_key))
  if (sourceKeys.size !== packets.length) {
    throw new Error('Generated duplicate source_key values; provide explicit unique sourceKey values')
  }

  return packets
}

const getServiceClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL')
  }

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

const submitPacket = async (client, packet) => {
  const { data: existing, error: lookupError } = await client
    .from('automation_approval_packets')
    .select('id,status,source_key,title')
    .eq('source_key', packet.source_key)
    .maybeSingle()

  if (lookupError) throw lookupError

  if (existing) {
    return { action: 'skipped_existing', packet: existing }
  }

  const { data: inserted, error: insertError } = await client
    .from('automation_approval_packets')
    .insert(packet)
    .select('id,status,source_key,title')
    .single()

  if (insertError) throw insertError

  const events = [
    {
      packet_id: inserted.id,
      event_type: 'created',
      message: `Daily scan winner packet created: ${packet.title}`,
      metadata: { sourceKey: packet.source_key, candidateId: packet.candidate_id },
    },
    {
      packet_id: inserted.id,
      event_type: 'review_ready',
      message: `Daily scan winner ready for Tayler approval: ${packet.title}`,
      metadata: { sourceKey: packet.source_key, candidateId: packet.candidate_id },
    },
  ]

  const { error: eventError } = await client
    .from('automation_approval_packet_events')
    .insert(events)

  if (eventError) throw eventError

  return { action: 'inserted', packet: inserted }
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const input = JSON.parse(await readFile(args.input, 'utf8'))
  const packets = buildDailyScanApprovalPackets(input)

  if (args.dryRun) {
    const result = { mode: 'dry-run', packetCount: packets.length, packets }
    console.log(args.json ? JSON.stringify(result, null, 2) : `Dry run OK: ${packets.length} packets ready.`)
    return
  }

  const client = getServiceClient()
  const results = []
  for (const packet of packets) {
    results.push(await submitPacket(client, packet))
  }

  const result = { mode: 'apply', packetCount: packets.length, results }
  console.log(args.json ? JSON.stringify(result, null, 2) : `Submitted ${results.filter(item => item.action === 'inserted').length} packets.`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
