import { supabase } from './supabase'

export type OperationsHealthSnapshot = {
  environment: 'production'
  frontend_sha: string | null
  frontend_build_id: string | null
  deploy_id: string | null
  deploy_url: string | null
  release_workflow_url: string | null
  deployed_at: string | null
  migration_version: string | null
  migrations_current: boolean
  function_manifest_sha256: string | null
  active_function_count: number
  paused_function_count: number
  removed_function_count: number
  functions_current: boolean
  backend_checked_at: string | null
  smoke_status: 'pending' | 'passed' | 'failed'
  smoke_checked_at: string | null
  app_http_status: number | null
  push_ready: boolean
  push_missing_requirements: string[]
  news_state: 'paused'
  bridge_state: 'paused'
  created_at: string
  updated_at: string
}

const OPERATIONS_HEALTH_COLUMNS = [
  'environment',
  'frontend_sha',
  'frontend_build_id',
  'deploy_id',
  'deploy_url',
  'release_workflow_url',
  'deployed_at',
  'migration_version',
  'migrations_current',
  'function_manifest_sha256',
  'active_function_count',
  'paused_function_count',
  'removed_function_count',
  'functions_current',
  'backend_checked_at',
  'smoke_status',
  'smoke_checked_at',
  'app_http_status',
  'push_ready',
  'push_missing_requirements',
  'news_state',
  'bridge_state',
  'created_at',
  'updated_at',
].join(',')

export const fetchOperationsHealthSnapshot = async (): Promise<OperationsHealthSnapshot | null> => {
  const { data, error } = await supabase
    .from('operations_health_snapshot')
    .select(OPERATIONS_HEALTH_COLUMNS)
    .eq('environment', 'production')
    .maybeSingle()

  if (error) throw error
  return (data as OperationsHealthSnapshot | null) ?? null
}

export const isOperationsSmokeFresh = (
  checkedAt: string | null,
  now = Date.now(),
  maxAgeMinutes = 35
) => {
  if (!checkedAt) return false
  const checkedTime = Date.parse(checkedAt)
  return Number.isFinite(checkedTime)
    && now - checkedTime <= maxAgeMinutes * 60_000
}
