/**
 * Provider-only proof. Default: write a local plan, no credentials or network.
 * Root reviews callbacks/agents and coordinates --execute. No member/app rows.
 * Run with Deno --node-modules-dir=none to use the Edge's pinned LiveKit SDK.
 * Execution permissions: --allow-env --allow-read --allow-sys=homedir
 * --allow-write=output/privacy/livekit-cleanup
 * --allow-net=shadow-pgcs0hub.livekit.cloud
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { AgentDispatchClient } from 'npm:livekit-server-sdk@2.17.0'
import { createLiveKitClients } from '../supabase/functions/_shared/shado-live.ts'
import { createLiveKitCleanupPlan, LIVEKIT_QA_PROJECT, runLiveKitCleanupProof, validateLiveKitCleanupPlan, validateLiveKitIsolationReview } from './livekit-cleanup-isolation.mjs'

const args = process.argv.slice(2)
const execute = args.includes('--execute')
const planArg = args.find(value => value.startsWith('--plan='))?.slice(7)
const reviewArg = args.find(value => value.startsWith('--isolation-review='))?.slice(19)
assert(args.every(value => value === '--execute' || value.startsWith('--plan=') || value.startsWith('--isolation-review=')), 'Unknown command argument')
const plan = planArg ? validateLiveKitCleanupPlan(JSON.parse(await readFile(planArg, 'utf8'))) : createLiveKitCleanupPlan()
const outputDir = path.resolve('output/privacy/livekit-cleanup', plan.operationId)
await mkdir(outputDir, { recursive: true })
const planPath = path.join(outputDir, 'plan.json')
const evidencePath = path.join(outputDir, 'result.json')
const save = async (target, value) => {
  await writeFile(`${target}.tmp`, JSON.stringify(value, null, 2))
  await rename(`${target}.tmp`, target)
}
await save(planPath, plan)
if (!execute) {
  console.log(JSON.stringify({ mode: 'local-plan-only', plan: planPath, project: plan.project, roomName: plan.roomName,
    agentName: plan.agentName, creates: 1, joins: 0, tracks: 0, appWrites: 0, settingsChanges: 0 }))
} else {
  assert(planArg && reviewArg, 'Execution requires the exact reviewed plan and fresh isolation review')
  assert(globalThis.Deno?.version?.deno, 'Use Deno so the same pinned Edge SDK transport is exercised')
  validateLiveKitIsolationReview(JSON.parse(await readFile(reviewArg, 'utf8')))
  const require = createRequire(import.meta.url)
  // js-yaml is already installed with repository tooling; no new dependency.
  const yaml = require('js-yaml')
  const configuration = yaml.load(await readFile(path.join(os.homedir(), '.livekit', 'cli-config.yaml'), 'utf8'))
  const matches = configuration.projects?.filter(item => item.name === LIVEKIT_QA_PROJECT.name && item.project_id === LIVEKIT_QA_PROJECT.id)
  assert.equal(matches?.length, 1, 'The exact reviewed CLI project is required')
  const project = matches[0]
  assert.equal(project.url, LIVEKIT_QA_PROJECT.url)
  assert(typeof project.api_key === 'string' && project.api_key.length > 5)
  assert(typeof project.api_secret === 'string' && project.api_secret.length > 10)
  Deno.env.set('LIVEKIT_URL', project.url)
  Deno.env.set('LIVEKIT_API_KEY', project.api_key)
  Deno.env.set('LIVEKIT_API_SECRET', project.api_secret)
  const clients = createLiveKitClients()
  const dispatches = new AgentDispatchClient(clients.serviceUrl, clients.apiKey, clients.apiSecret)
  const evidence = await runLiveKitCleanupProof({ rooms: clients.rooms, dispatches, plan, save: value => save(evidencePath, value) })
  Deno.env.delete('LIVEKIT_API_KEY')
  Deno.env.delete('LIVEKIT_API_SECRET')
  console.log(JSON.stringify({ project: plan.project.name, roomName: plan.roomName, passed: evidence.checks.filter(item => item.passed).length,
    failed: evidence.checks.filter(item => !item.passed).length, cleanup: evidence.cleanup, error: evidence.error, evidence: evidencePath }))
  if (evidence.error || !evidence.cleanup.verified) process.exitCode = 1
}
