import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const runId = process.argv[2];
if (!runId) {
  console.log("Usage: node tools/feedback-build-processor/get-run-details.mjs <run-id>");
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf8");
  return content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) return null;
      let value = match[2] ?? "";
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return { key: match[1], value };
    })
    .filter(Boolean);
}

function loadEnv() {
  for (const name of [".env", ".env.local", ".env.production"]) {
    const fullPath = path.join(repoRoot, name);
    for (const entry of readEnvFile(fullPath)) {
      process.env[entry.key] = entry.value;
    }
  }
  if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  }
}

function parseProjectRefFromUrl(url) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return host.split(".")[0] || null;
}

function fetchServiceRoleKey(projectRef) {
  const stdout = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", projectRef, "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  const keys = JSON.parse(stdout);
  const svc = Array.isArray(keys)
    ? keys.find((k) => k && k.name === "service_role")
    : null;
  if (!svc?.api_key) return null;
  return svc.api_key;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("Missing SUPABASE_URL (or VITE_SUPABASE_URL)");

  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    const ref = parseProjectRefFromUrl(url);
    if (!ref) {
      throw new Error(
        "Missing SUPABASE_SERVICE_ROLE_KEY and could not parse project ref from SUPABASE_URL"
      );
    }
    serviceKey = fetchServiceRoleKey(ref);
    if (!serviceKey) {
      throw new Error(
        "Unable to fetch SUPABASE_SERVICE_ROLE_KEY from Supabase CLI (missing auth or CLI capability)"
      );
    }
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  loadEnv();
  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (err) {
    console.log(String(err?.message || err));
    process.exit(0);
  }

  const { data: run, error: runError } = await supabase
    .from("feedback_build_runs")
    .select(
      "id,feedback_submission_id,created_by,companion_prompt,generated_prompt,included_attachments,recognition_enabled,status,current_stage,branch_name,pr_url,preview_url,preview_warning,summary,merge_commit_sha,failure_message,approved_merge_at,started_at,completed_at,created_at,updated_at"
    )
    .eq("id", runId)
    .maybeSingle();
  if (runError) throw runError;
  if (!run) {
    console.log(`Run not found: ${runId}`);
    return;
  }

  const { data: submission, error: subError } = await supabase
    .from("feedback_submissions")
    .select("id,user_id,submission_type,title,description,status,created_at")
    .eq("id", run.feedback_submission_id)
    .maybeSingle();
  if (subError) throw subError;

  const { data: submitter, error: userError } = await supabase
    .from("users")
    .select("id,display_name,username")
    .eq("id", submission?.user_id)
    .maybeSingle();
  if (userError) throw userError;

  console.log(JSON.stringify({ run, submission, submitter }, null, 2));
}

main().catch((err) => {
  console.log(`Error: ${String(err?.message || err)}`);
  process.exit(0);
});

