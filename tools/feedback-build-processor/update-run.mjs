import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const runId = process.argv[2];
let patchJson = process.argv[3];

if (!runId) {
  console.log(
    'Usage: node tools/feedback-build-processor/update-run.mjs <run-id> <json-patch>|-'
  );
  process.exit(0);
}

if (!patchJson || patchJson === "-") {
  try {
    patchJson = fs.readFileSync(0, "utf8").trim();
  } catch {
    patchJson = "";
  }
}

let patch;
try {
  patch = JSON.parse(patchJson);
} catch {
  console.log("Invalid JSON patch.");
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

  const { error } = await supabase
    .from("feedback_build_runs")
    .update(patch)
    .eq("id", runId);

  if (error) throw error;
  console.log("Updated run.");
}

main().catch((err) => {
  console.log(`Error: ${String(err?.message || err)}`);
  process.exit(0);
});
