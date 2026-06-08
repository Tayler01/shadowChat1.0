import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvFiles(repoRoot) {
  const candidates = ['.env', '.env.local', '.env.production'].map((f) =>
    path.join(repoRoot, f),
  );
  /** @type {string[]} */
  const loaded = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const parsed = parseEnvFile(candidate);
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    loaded.push(path.basename(candidate));
  }
  return loaded;
}

function inferProjectRef(supabaseUrl) {
  if (!supabaseUrl) return null;
  const match = supabaseUrl.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co\/?/i);
  return match ? match[1] : null;
}

function getServiceRoleKeyViaCli(projectRef) {
  const stdout = execFileSync(
    'supabase',
    ['projects', 'api-keys', '--project-ref', projectRef, '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const parsed = JSON.parse(stdout);
  const keyObj = Array.isArray(parsed)
    ? parsed.find((entry) => entry && entry.name === 'service_role')
    : null;
  return keyObj?.api_key ?? null;
}

function createAdminClient({ supabaseUrl, serviceRoleKey }) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetch.bind(globalThis) },
  });
}

function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function jsonPrint(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

async function bootstrap() {
  const repoRoot = process.cwd();
  const loadedEnvFiles = loadEnvFiles(repoRoot);

  if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    return {
      ok: false,
      loadedEnvFiles,
      error: 'Missing SUPABASE_URL (or VITE_SUPABASE_URL).',
    };
  }

  let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  if (!serviceRoleKey) {
    const projectRef = inferProjectRef(supabaseUrl);
    if (!projectRef) {
      return {
        ok: false,
        loadedEnvFiles,
        error: 'Could not parse project ref from SUPABASE_URL.',
      };
    }
    try {
      serviceRoleKey = getServiceRoleKeyViaCli(projectRef) ?? '';
    } catch {
      return {
        ok: false,
        loadedEnvFiles,
        error: 'Supabase CLI could not return service_role key.',
      };
    }
    if (!serviceRoleKey) {
      return {
        ok: false,
        loadedEnvFiles,
        error: 'No service_role key found in Supabase CLI output.',
      };
    }
  }

  return { ok: true, loadedEnvFiles, supabaseUrl, serviceRoleKey };
}

function msSince(date) {
  return Date.now() - date.getTime();
}

function minutes(ms) {
  return ms / 1000 / 60;
}

async function cmdSelect() {
  const boot = await bootstrap();
  if (!boot.ok) return boot;

  const supabase = createAdminClient(boot);
  const staleThresholdMinutes = 45;

  const { data: activeRuns, error: activeError } = await supabase
    .from('feedback_build_runs')
    .select('id,status,current_stage,updated_at,branch_name,pr_url,preview_url,feedback_submission_id')
    .in('status', ['running', 'merging']);

  if (activeError) return { ok: false, error: `Failed to query active runs: ${activeError.message}` };

  if (activeRuns && activeRuns.length > 0) {
    const activeIds = activeRuns.map((r) => r.id);
    const { data: logs, error: logError } = await supabase
      .from('feedback_build_run_logs')
      .select('run_id,created_at')
      .in('run_id', activeIds)
      .order('created_at', { ascending: false });

    if (logError) return { ok: false, error: `Failed to query run logs: ${logError.message}` };

    const latestLogByRun = new Map();
    for (const log of logs ?? []) {
      if (!latestLogByRun.has(log.run_id)) latestLogByRun.set(log.run_id, new Date(log.created_at));
    }

    const withActivity = activeRuns.map((run) => {
      const updatedAt = run.updated_at ? new Date(run.updated_at) : new Date(0);
      const latestLogAt = latestLogByRun.get(run.id) ?? new Date(0);
      const latestActivityAt = updatedAt > latestLogAt ? updatedAt : latestLogAt;
      return { run, latestActivityAt };
    });

    withActivity.sort((a, b) => b.latestActivityAt.getTime() - a.latestActivityAt.getTime());
    const primary = withActivity[0];
    const ageMinutes = minutes(msSince(primary.latestActivityAt));

    if (ageMinutes < staleThresholdMinutes) {
      return {
        ok: true,
        action: 'exit-active',
        reason: `Active run ${primary.run.id} is not stale (${ageMinutes.toFixed(1)}m old).`,
        run: primary.run,
      };
    }

    return {
      ok: true,
      action: 'resume-stale',
      reason: `Active run ${primary.run.id} is stale (${ageMinutes.toFixed(1)}m old).`,
      run: primary.run,
    };
  }

  const { data: approvedRuns, error: approvedError } = await supabase
    .from('feedback_build_runs')
    .select('id,status,current_stage,approved_merge_at,branch_name,pr_url,preview_url,feedback_submission_id,updated_at')
    .eq('status', 'approved_to_merge')
    .order('approved_merge_at', { ascending: true })
    .limit(1);

  if (approvedError) {
    return { ok: false, error: `Failed to query approved runs: ${approvedError.message}` };
  }

  if (approvedRuns && approvedRuns.length > 0) {
    const run = approvedRuns[0];
    const { error: claimError } = await supabase
      .from('feedback_build_runs')
      .update({ status: 'merging', current_stage: 'merging' })
      .eq('id', run.id)
      .eq('status', 'approved_to_merge');
    if (claimError) return { ok: false, error: `Failed to claim merge run: ${claimError.message}` };
    const { error: logError } = await supabase.from('feedback_build_run_logs').insert({
      run_id: run.id,
      stage: 'merging',
      message: 'Merge approved; processor claimed run for merge.',
      metadata: {},
    });
    if (logError) return { ok: false, error: `Failed to insert merging log: ${logError.message}` };
    return { ok: true, action: 'process-merge', run: { ...run, status: 'merging', current_stage: 'merging' } };
  }

  const { data: pendingRuns, error: pendingError } = await supabase
    .from('feedback_build_runs')
    .select('id,status,current_stage,created_at,branch_name,pr_url,preview_url,feedback_submission_id,updated_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (pendingError) return { ok: false, error: `Failed to query pending runs: ${pendingError.message}` };
  if (!pendingRuns || pendingRuns.length === 0) return { ok: true, action: 'none' };

  const run = pendingRuns[0];
  const { error: claimError } = await supabase
    .from('feedback_build_runs')
    .update({ status: 'running', current_stage: 'classifying', started_at: new Date().toISOString() })
    .eq('id', run.id)
    .eq('status', 'pending');

  if (claimError) return { ok: false, error: `Failed to claim pending run: ${claimError.message}` };

  const { error: logError } = await supabase.from('feedback_build_run_logs').insert({
    run_id: run.id,
    stage: 'classifying',
    message: 'Processor claimed run and started classification.',
    metadata: {},
  });
  if (logError) return { ok: false, error: `Failed to insert classifying log: ${logError.message}` };

  return {
    ok: true,
    action: 'process-pending',
    run: { ...run, status: 'running', current_stage: 'classifying', started_at: new Date().toISOString() },
  };
}

async function cmdRunContext() {
  const args = parseArgs(process.argv.slice(3));
  const runId = String(args['run-id'] ?? '');
  if (!runId) return { ok: false, error: 'Missing --run-id.' };

  const boot = await bootstrap();
  if (!boot.ok) return boot;
  const supabase = createAdminClient(boot);

  const { data: run, error: runError } = await supabase
    .from('feedback_build_runs')
    .select(
      'id,status,current_stage,branch_name,pr_url,preview_url,preview_warning,summary,failure_message,recognition_enabled,companion_prompt,generated_prompt,included_attachments,feedback_submission_id,created_by,created_at,updated_at,approved_merge_at',
    )
    .eq('id', runId)
    .limit(1)
    .single();
  if (runError) return { ok: false, error: `Failed to load run: ${runError.message}` };

  const { data: submission, error: submissionError } = await supabase
    .from('feedback_submissions')
    .select('id,user_id,submission_type,title,description,attachments,status,created_at,user_agent')
    .eq('id', run.feedback_submission_id)
    .limit(1)
    .single();
  if (submissionError) return { ok: false, error: `Failed to load submission: ${submissionError.message}` };

  const { data: submitter, error: userError } = await supabase
    .from('users')
    .select('id,username,display_name')
    .eq('id', submission.user_id)
    .limit(1)
    .single();

  if (userError) {
    return { ok: false, error: `Failed to load submitter: ${userError.message}` };
  }

  return { ok: true, run, submission, submitter };
}

async function cmdStage() {
  const args = parseArgs(process.argv.slice(3));
  const runId = String(args['run-id'] ?? '');
  const stage = String(args['stage'] ?? '');
  const message = String(args['message'] ?? '');
  const status = typeof args['status'] === 'string' ? String(args['status']) : null;
  const currentStage =
    typeof args['current-stage'] === 'string' ? String(args['current-stage']) : null;
  const metadataJson = typeof args['metadata-json'] === 'string' ? String(args['metadata-json']) : null;

  if (!runId) return { ok: false, error: 'Missing --run-id.' };
  if (!stage) return { ok: false, error: 'Missing --stage.' };
  if (!message) return { ok: false, error: 'Missing --message.' };

  const metadata = metadataJson ? JSON.parse(metadataJson) : {};

  const boot = await bootstrap();
  if (!boot.ok) return boot;
  const supabase = createAdminClient(boot);

  /** @type {Record<string, unknown>} */
  const updateFields = {};
  if (status) updateFields.status = status;
  if (currentStage) updateFields.current_stage = currentStage;
  if (Object.keys(updateFields).length > 0) {
    const { error: updateError } = await supabase.from('feedback_build_runs').update(updateFields).eq('id', runId);
    if (updateError) return { ok: false, error: `Failed to update run: ${updateError.message}` };
  }

  const { error: logError } = await supabase.from('feedback_build_run_logs').insert({
    run_id: runId,
    stage,
    message,
    metadata,
  });

  if (logError) return { ok: false, error: `Failed to insert run log: ${logError.message}` };

  return { ok: true };
}

async function cmdSet() {
  const args = parseArgs(process.argv.slice(3));
  const runId = String(args['run-id'] ?? '');
  const fieldsJson = typeof args['fields-json'] === 'string' ? String(args['fields-json']) : '';
  if (!runId) return { ok: false, error: 'Missing --run-id.' };
  if (!fieldsJson) return { ok: false, error: 'Missing --fields-json.' };

  /** @type {Record<string, unknown>} */
  const fields = JSON.parse(fieldsJson);
  const boot = await bootstrap();
  if (!boot.ok) return boot;
  const supabase = createAdminClient(boot);
  const { error } = await supabase.from('feedback_build_runs').update(fields).eq('id', runId);
  if (error) return { ok: false, error: `Failed to update run: ${error.message}` };
  return { ok: true };
}

async function main() {
  const cmd = process.argv[2];
  let result;
  try {
    if (cmd === 'select') result = await cmdSelect();
    else if (cmd === 'run-context') result = await cmdRunContext();
    else if (cmd === 'stage') result = await cmdStage();
    else if (cmd === 'set') result = await cmdSet();
    else result = { ok: false, error: `Unknown command: ${cmd}` };
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  jsonPrint(result);
  if (!result.ok) process.exitCode = 0;
}

await main();
