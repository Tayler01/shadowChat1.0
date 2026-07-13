import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260713003323_shadow_pin_creator_studio_backend.sql'
)
const hardeningMigrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260713042749_shadow_pin_creator_studio_hardening.sql'
)

const source = [migrationPath, hardeningMigrationPath]
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n')
const sql = source.toLowerCase().replace(/\s+/g, ' ')

describe('ShadowPin Creator Studio backend source contract', () => {
  test('keeps drafts outside canonical Pins with a private staged-asset domain', () => {
    expect(sql).toContain('shadow_pin_creator_drafts')
    expect(sql).toContain('shadow_pin_draft_assets')
    expect(sql).toContain('shadow-pin-drafts')
    expect(sql).toContain('creator_draft_id')

    expect(sql).toMatch(/shadow_pin_creator_drafts[\s\S]*?enable row level security/)
    expect(sql).toMatch(/shadow_pin_draft_assets[\s\S]*?enable row level security/)
    expect(sql).toMatch(/shadow-pin-drafts[\s\S]*?(false|public\s*=\s*false)/)
  })

  test('defines the recoverable draft and server-owned asset lifecycles', () => {
    for (const state of [
      'editing',
      'uploading',
      'processing',
      'ready',
      'preparing_publish',
      'publish_ready',
      'published',
      'failed',
      'abandoned',
    ]) {
      expect(sql).toContain(`'${state}'`)
    }

    for (const state of [
      'reserved',
      'uploading',
      'processing',
      'ready',
      'publish_ready',
      'failed',
      'superseded',
      'deleted',
    ]) {
      expect(sql).toContain(`'${state}'`)
    }

    expect(sql).toMatch(/update_shadow_pin_creator_draft[\s\S]*?expires_at <= now\(\)[\s\S]*?draft has expired/)
    expect(sql).toMatch(/finalize_shadow_pin_creator_draft[\s\S]*?expires_at <= now\(\)[\s\S]*?draft has expired/)
  })

  test('exposes only the bounded owner workflow and idempotent finalizer', () => {
    for (const rpc of [
      'create_shadow_pin_creator_draft',
      'update_shadow_pin_creator_draft',
      'list_my_shadow_pin_creator_drafts',
      'delete_shadow_pin_creator_draft',
      'finalize_shadow_pin_creator_draft',
    ]) {
      expect(sql).toContain(`function public.${rpc}`)
    }

    expect(sql).toContain('expected_revision')
    expect(sql).toContain('idempotency')
    expect(sql).toContain('publish_ready')
    expect(sql).toMatch(/creator_draft_id[\s\S]*?unique|unique[\s\S]*?creator_draft_id/)
    expect(sql).toMatch(/finalize_shadow_pin_creator_draft[\s\S]*?for update/)
  })

  test('keeps the member RPC signatures aligned with the typed client payloads', () => {
    expect(sql).toMatch(/create_shadow_pin_creator_draft\( target_category_id uuid, target_title text, target_description text, target_tags text\[\], target_source_kind text, target_image_id uuid, target_client_mutation_id uuid \)/)
    expect(sql).toMatch(/update_shadow_pin_creator_draft\( target_draft_id uuid, target_expected_revision integer, target_source_kind text, target_category_id uuid, target_title text, target_description text, target_tags text\[\] \)/)
    expect(sql).toContain('list_my_shadow_pin_creator_drafts(target_limit integer default 25)')
    expect(sql).toMatch(/delete_shadow_pin_creator_draft\( target_draft_id uuid, target_expected_revision integer \)/)
    expect(sql).toMatch(/finalize_shadow_pin_creator_draft\( target_draft_id uuid, target_expected_revision integer, target_publish_idempotency_key uuid \)/)
  })

  test('denies anonymous access and direct authenticated asset-ledger mutation', () => {
    expect(sql).toMatch(
      /revoke all on table public\.shadow_pin_creator_drafts\s*,\s*public\.shadow_pin_draft_assets[\s\S]*?from public\s*,\s*anon/
    )
    expect(sql).not.toMatch(
      /grant\s+(?:insert|update|delete|all)[^;]*on\s+(?:table\s+)?public\.shadow_pin_draft_assets[^;]*to\s+authenticated/
    )
    expect(sql).not.toMatch(
      /grant\s+execute[^;]*finalize_shadow_pin_creator_draft[^;]*to\s+anon/
    )
  })

  test('does not replace or remove the production direct-create contracts', () => {
    expect(sql).not.toMatch(/drop\s+table[^;]*shadow_pin_images/)
    expect(sql).not.toMatch(/drop\s+function[^;]*(create_shadow_pin_image|set_shadow_pin_image_tags)/)
    expect(sql).not.toMatch(/drop\s+column[^;]*(reply_to|processing_status|media_type)/)
  })

  test('rejects a replacement draft when the canonical Pin changed after capture', () => {
    expect(sql).toContain('target_image_updated_at')
    expect(sql).toMatch(/shadow_pin_creator_drafts[\s\S]*?target_image_updated_at\s+timestamptz/)
    expect(sql).toMatch(/target_image_updated_at[\s\S]*?shadow_pin_images[\s\S]*?updated_at/)
    expect(sql).toContain('target pin changed after this draft was created')
  })

  test('bounds staged-asset generations and leases promoted media to recoverable server cleanup', () => {
    expect(sql).toContain('promotion_lease')
    expect(sql).toContain('claim_shadow_pin_image_promotion')
    expect(sql).toContain('release_shadow_pin_image_promotion')
    expect(sql).toMatch(/generation\s+between\s+1\s+and\s+32/)
    expect(sql).toContain('enforce_shadow_pin_draft_asset_caps')
    expect(sql).toContain('too many active creator studio assets')
  })
})
