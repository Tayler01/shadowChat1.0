# Shadow Mystery

## Documentation Status - July 10, 2026

Updated for the Shadow Mystery publishing-studio release. This feature guide is
current for the hybrid bundled-plus-Supabase reader, the operator studio, and
the private artwork contract. Remaining cross-product work is tracked in
[FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

Shadow Mystery is a longform mystery-novella surface inside the ShadowChat
Entertainment area. Four bundled V1 stories remain permanent reader fallbacks,
while newly published stories can now come from an isolated Supabase domain.

## Current Status

As of 2026-07-10:

- Shadow Mystery is wired into the Entertainment picker.
- The story list/detail surface is mobile-first and starts instantly from the
  bundled archive while published Supabase stories load.
- Database stories replace a bundled story only when their slug or explicit
  `legacy_story_id` matches it. Otherwise all four bundled cases remain visible.
- Admins and sub-admins have a mobile-friendly publishing studio for story
  metadata, ordered chapters, chapter art, source credits, drafts, publishing,
  and deletion.
- Publication is rejected by the database unless the story has a publish date,
  at least one chapter, cover and header art, and at least one source credit.
- Artwork is stored in the private `shadow-mystery` bucket and delivered with
  six-hour signed transformation URLs sized for cover, header, and chapter use.
- The launch story is `The Devil's School`, about Public
  School Number Four / Annie Lytle School in Jacksonville, Florida.
- The second local proof story is `The Last Tee Time At Camelot`, about Camelot
  Golf Course and the Pressmen's Home ghost town in Rogersville, Tennessee.
- The third local proof story is `The Glass That Remembered Us`, a 500-years
  post-collapse future mystery built around Microsoft Project Silica and
  borosilicate glass data storage research.
- The fourth local proof story is `The Sleep That Wouldn't End`, about the
  encephalitis lethargica epidemic, post-encephalitic parkinsonism, the
  contested influenza link, autoimmune theories, and the still-unresolved
  cause.
- Stories are written as immersive 10-15 minute mystery novellas, with the
  ghost, murderer, cannibal-principal, and devil-worship legends driving the
  School Four mystery while real names, dates, and history are woven into the
  prose.
- The Camelot story leans into the lost golfer, ghost course, sanitarium/asylum,
  warehouse/service-building, candle-rumor, and scorekeeper legends while
  weaving in the real Pressmen's Home union-town and Camelot course history.
- The Silica story uses science-fiction mystery rather than local folklore:
  relic readers, a fear archive, a hidden answer archive, and real glass
  storage facts woven into the narrative.
- The Encephalitis Lethargica story leans into medical cold-case atmosphere:
  sleeping wards, frozen survivors, von Economo's case history, the Spanish flu
  shadow, Oliver Sacks's awakenings, and the suspect-board of failed causes.
- The page uses generated picker, cover, header, and section art plus real
  Wikimedia Commons, National Park Service / National Register, Library of
  Congress, NASA, and FDA images optimized into the repo with attribution.

## Roadmap

1. Static V1 launch: complete.
   - Add Entertainment picker entry.
   - Add immersive Shadow Mystery shell.
   - Add newest-first story list.
   - Add full story reader.
   - Add generated cover/header/section assets and real image placements.
2. Story expansion.
   - Add more hardcoded stories using the `shadow-mystery-story` Codex skill.
   - Keep every story shaped as app-ready data for future migration.
3. Admin publishing: complete.
   - Dedicated story, chapter, image, and source-credit tables.
   - Isolated from News, Shado TV, chat messages, and DMs.
   - Admin/sub-admin creation, editing, draft/published state, and deletion.
4. Media pipeline: complete for still artwork.
   - Generated and uploaded story assets stay in a constrained private bucket.
   - Signed transformed images are sized for phone reading.
   - Caption, source, credit, and license fields travel with every image record.

## V1 Data Contract

The hardcoded story model lives in
[`src/features/entertainment/shadow-mystery/data.ts`](C:/repos/chat2.0/src/features/entertainment/shadow-mystery/data.ts:1).

The current shape is intentionally close to a future database model:

- story identity, slug, title, date, read time, cover, and header
- ordered chapters
- per-chapter body paragraphs
- optional per-chapter image, caption, source, credit, and license
- source list for quiet footer attribution

The database API maps the normalized tables back into this same
`ShadowMysteryStory` reader shape. Published database stories are merged with,
not substituted wholesale for, `SHADOW_MYSTERY_STORIES`.

## Supabase Domain

The canonical migration is
[`20260710041539_shadow_mystery_publishing_studio.sql`](C:/repos/chat2.0/supabase/migrations/20260710041539_shadow_mystery_publishing_studio.sql:1).

Tables:

- `public.shadow_mystery_stories`
- `public.shadow_mystery_chapters`
- `public.shadow_mystery_images`
- `public.shadow_mystery_sources`

All four tables have RLS enabled. Signed-in members can select published story
trees only. Existing `is_app_operator` authority allows admins and sub-admins
to read drafts and perform CRUD. Anonymous table privileges are revoked, and
authenticated table privileges are explicit. The publication trigger is a
database backstop rather than a UI-only checklist.

The `shadow-mystery` Storage bucket is private, limited to 15 MB per object,
and accepts JPG, PNG, and WebP images. Operator uploads must live under the
operator's user-id folder. A regular member can sign only an object whose exact
path is referenced by an image record belonging to a published story.

## Publishing Studio

The studio component lives at
[`src/components/settings/ShadowMysteryStudio.tsx`](C:/repos/chat2.0/src/components/settings/ShadowMysteryStudio.tsx:1)
and is exposed under Settings > Admin > Shadow Mystery Studio. It intentionally
uses the app-wide operator model: full admins and sub-admins can publish, while
ordinary members cannot see or mutate draft content.

The frontend data boundary lives at
[`src/features/entertainment/shadow-mystery/api.ts`](C:/repos/chat2.0/src/features/entertainment/shadow-mystery/api.ts:1).
It validates lengths, HTTPS source URLs, paragraph arrays, file types and sizes,
and artwork placement before sending writes. Those checks complement rather
than replace database constraints and RLS.

## Asset Strategy

Static launch assets live under
`public/entertainment/shadow-mystery/`.

Generated art is used for:

- Entertainment picker banner
- story covers
- story headers
- atmospheric story-section plates

Real images are used only where licensing is clear enough for local optimized
copies and attribution. The existing stories use Wikimedia Commons, National
Park Service / National Register, NASA, and FDA images credited in the UI and
source footer.

New studio artwork is not written into `public/`. It stays in private Supabase
Storage and is hydrated into signed transformed URLs when the reader or studio
loads it.

## Validation

Focused checks for this domain:

```powershell
npx jest --runInBand tests/shadowMysteryPublishing.test.ts tests/ShadowMysteryScreen.test.tsx tests/ShadowMysteryStudio.test.tsx
npx eslint src/features/entertainment/shadow-mystery/api.ts src/features/entertainment/shadow-mystery/ShadowMysteryScreen.tsx src/components/settings/ShadowMysteryStudio.tsx --max-warnings=0
npx tsc --noEmit -p tsconfig.app.json
supabase db lint --local --level warning
supabase db advisors --local --type security --level warn --fail-on warn
supabase db advisors --local --type performance --level warn --fail-on warn
```

## Writing Standard

Shadow Mystery stories should read like short mystery novellas, not explainers.
Facts, dates, real people, place names, and folklore should be woven into
scenes, captions, and narrative turns. Do not add a visible fact-vs-fiction
section unless the user asks for it.
