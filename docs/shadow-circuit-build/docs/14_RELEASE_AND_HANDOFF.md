# Release-candidate handoff and rollback

This build task stops at a reviewable release candidate. It does not authorize a production deploy, a repo push, a purchase, a linked production migration or a content-license decision.

## Candidate contents
Exact source diff; dependency lockfile; asset scripts/editable originals kept outside runtime; optimized assets/manifests; content provenance and allowed shipping list; new local migrations and RLS tests; level schema/import and validation tooling; reproducible build/test commands; recorded tool versions; complete requirement/asset/level ledgers; browser and actual device results; known issues and blocked gates; annotated screenshots of loading/main menu/gameplay/pause/results/settings on phones.

## Separate readiness report
- ENGINEERING: actual implemented/tested systems and missing items.
- VISUAL/CONTENT: final asset roster, sound review, complete intended available levels and verified outcomes.
- ORIGINAL CAMPAIGN: source acquired/identity verified; exact 149-level Windows target checks; permissions; all level validation. Community completion is not this status.
- PHYSICAL DEVICE/RELEASE: actual phone/PWA test coverage, performance budgets, content release approval, preview/production differences.

## Release procedure for later explicit approval
1. Review content license ledger and deployment allowlist. Assert restricted source data, `.blend`, source WAVs, secrets and fixture-only/debug data absent from `dist`.
2. Verify current app regression suite and feature flag off behavior.
3. Follow existing backend-first release policy for any approved migrations; backup/preservation strategy and backward compatibility documented.
4. Use approved preview build and actual headers/SW/version manifests. Reconfirm target device smoke results on this exact build.
5. Only after explicit approval publish using existing repository release workflow. Do not bypass checks or create new deploy credentials.
6. After release, verify no regression in ordinary chat/DM/Play flows and new game launch/exit/save. Record actual build ID and remaining limitations.

## Rollback
Feature flag off removes new game launcher/route without breaking old routes. Preserve local save namespaces and cloud records for recovery; do not roll back by deleting all IndexedDB/service-worker caches or shared tables. Keep prior runtime manifest/cache version until migration is confirmed. Content-version mismatch offers a safe compatible checkpoint/restart and explains any unsupported save. Database rollback must preserve users' data and follow the repo's forward-migration practice; do not invent destructive down migrations.

## Operations boundaries
Use existing Sentry/error hooks if available with minimal game-only metadata (build/ruleset/pack hash/error class); no raw imported maps, chats, JWTs or full identity data. Add a user-copyable diagnostic code, not a public debug console. Error reporting failure must not block play. No always-on streaming/Realtime subscription for a solo puzzle engine. A future public leaderboard, co-op, native Unity app or custom level sharing is a separate project.
