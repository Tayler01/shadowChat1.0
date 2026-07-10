import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  mergeShadowMysteryStories,
  paragraphsFromShadowMysteryDraft,
  slugifyShadowMysteryValue,
} from '../src/features/entertainment/shadow-mystery/api'
import {
  SHADOW_MYSTERY_STORIES,
  type ShadowMysteryStory,
} from '../src/features/entertainment/shadow-mystery/data'

const root = process.cwd()
const migration = readFileSync(
  path.join(root, 'supabase/migrations/20260710041539_shadow_mystery_publishing_studio.sql'),
  'utf8'
)
const compactMigration = migration.replace(/\s+/g, ' ').toLowerCase()

const databaseStory: ShadowMysteryStory = {
  id: 'database-story-id',
  slug: 'database-case',
  title: 'Database Case',
  subtitle: 'A live case',
  locationLabel: 'Somewhere',
  publishedAt: '2026-07-10',
  readTimeMinutes: 12,
  deck: 'A published database case.',
  coverAsset: 'https://example.com/cover',
  headerAsset: 'https://example.com/header',
  chapters: [{ id: 'opening', title: 'Opening', body: ['Paragraph.'] }],
  sources: [{ label: 'Source', url: 'https://example.com/source', usage: 'Reference.' }],
}

describe('Shadow Mystery publishing contract', () => {
  it('keeps all four bundled stories while layering database publications newest-first', () => {
    expect(SHADOW_MYSTERY_STORIES).toHaveLength(4)

    const merged = mergeShadowMysteryStories([databaseStory])

    expect(merged).toHaveLength(5)
    expect(merged[0]).toEqual(databaseStory)
    SHADOW_MYSTERY_STORIES.forEach(story => {
      expect(merged.some(candidate => candidate.id === story.id)).toBe(true)
    })
  })

  it('replaces a bundled story only when its slug or explicit legacy id is published', () => {
    const legacy = SHADOW_MYSTERY_STORIES[0]
    const replacement = { ...databaseStory, slug: legacy.slug }

    expect(mergeShadowMysteryStories([replacement])).toHaveLength(4)
    expect(mergeShadowMysteryStories([databaseStory], SHADOW_MYSTERY_STORIES, [legacy.id])).toHaveLength(4)
  })

  it('normalizes authoring helpers without preserving blank paragraphs', () => {
    expect(slugifyShadowMysteryValue('  The Devil’s School!  ')).toBe('the-devil-s-school')
    expect(paragraphsFromShadowMysteryDraft('First line.\ncontinues.\n\n  \nSecond paragraph.')).toEqual([
      'First line. continues.',
      'Second paragraph.',
    ])
  })

  it('creates an isolated, validated, RLS-protected four-table domain', () => {
    expect(compactMigration.match(/create table if not exists public\.shadow_mystery_/g)).toHaveLength(4)
    expect(compactMigration).toContain('alter table public.shadow_mystery_stories enable row level security')
    expect(compactMigration).toContain('alter table public.shadow_mystery_chapters enable row level security')
    expect(compactMigration).toContain('alter table public.shadow_mystery_images enable row level security')
    expect(compactMigration).toContain('alter table public.shadow_mystery_sources enable row level security')
    expect(compactMigration).toContain("status text not null default 'draft' check (status in ('draft', 'published'))")
    expect(compactMigration).toContain('create trigger validate_shadow_mystery_publication_trigger')
    expect(compactMigration).toContain('requires cover and header artwork')
    expect(compactMigration).toContain('requires at least one source credit')
    expect(compactMigration).toContain('create or replace function public.guard_published_shadow_mystery_children()')
    expect(compactMigration).toContain('unpublish this shadow mystery story before removing its final chapter')
  })

  it('keeps anonymous clients out and grants operator writes through explicit RLS', () => {
    expect(compactMigration).toContain('revoke all on table public.shadow_mystery_stories from public, anon')
    expect(compactMigration).toContain('grant select, insert, update, delete on table public.shadow_mystery_stories to authenticated')
    expect(compactMigration).toContain('public.is_app_operator((select auth.uid()))')
    expect(compactMigration).toContain('members read published mysteries and operators read all')
    expect(compactMigration).not.toContain(' to anon')
  })

  it('uses a private constrained bucket and only signs artwork tied to published metadata', () => {
    expect(compactMigration).toContain("'shadow-mystery', 'shadow-mystery', false, 15728640")
    expect(compactMigration).toContain("array['image/png', 'image/jpeg', 'image/webp']")
    expect(compactMigration).toContain("bucket_id = 'shadow-mystery'")
    expect(compactMigration).toContain('where images.storage_path = storage.objects.name')
    expect(compactMigration).toContain("and stories.status = 'published'")
    expect(compactMigration).toContain("(storage.foldername(name))[1] = (select auth.uid())::text")

    const api = readFileSync(
      path.join(root, 'src/features/entertainment/shadow-mystery/api.ts'),
      'utf8'
    )
    expect(api).toContain('.createSignedUrl(row.storage_path, SIGNED_ARTWORK_TTL_SECONDS')
    expect(api).toContain('transform: IMAGE_TRANSFORMS[row.role]')
  })
})
