# Shadow Mystery

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This feature guide is current for the shipped product surface, with any known hardening or polish follow-ups tracked in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

Shadow Mystery is a hardcoded V1 longform mystery-novella surface inside the
ShadowChat Entertainment area.

## Current Status

As of 2026-05-25:

- Shadow Mystery is wired into the Entertainment picker.
- The story list/detail surface is static and mobile-first.
- The launch story is `The Devil's School`, about Public
  School Number Four / Annie Lytle School in Jacksonville, Florida.
- The second local proof story is `The Last Tee Time At Camelot`, about Camelot
  Golf Course and the Pressmen's Home ghost town in Rogersville, Tennessee.
- The third local proof story is `The Glass That Remembered Us`, a 500-years
  post-collapse future mystery built around Microsoft Project Silica and
  borosilicate glass data storage research.
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
- The page uses generated picker, cover, header, and section art plus real
  Wikimedia Commons, National Park Service / National Register, NASA, and FDA
  images optimized into the repo with attribution.

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
3. Admin publishing.
   - Add a dedicated Supabase domain for mystery stories, story sections, story
     images, and source credits.
   - Keep Shadow Mystery isolated from News, Shado TV, chat messages, and DMs.
   - Add admin/sub-admin story creation, editing, draft/published state, and
     artwork upload.
4. Media pipeline.
   - Store generated and uploaded story assets in a private bucket.
   - Serve signed transformed images sized for phone reading.
   - Preserve attribution and license notes on every copied real image.

## V1 Data Contract

The hardcoded story model lives in
[`src/features/entertainment/shadow-mystery/data.ts`](C:/repos/chat2.0/src/features/entertainment/shadow-mystery/data.ts:1).

The current shape is intentionally close to a future database model:

- story identity, slug, title, date, read time, cover, and header
- ordered chapters
- per-chapter body paragraphs
- optional per-chapter image, caption, source, credit, and license
- source list for quiet footer attribution

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

## Writing Standard

Shadow Mystery stories should read like short mystery novellas, not explainers.
Facts, dates, real people, place names, and folklore should be woven into
scenes, captions, and narrative turns. Do not add a visible fact-vs-fiction
section unless the user asks for it.
