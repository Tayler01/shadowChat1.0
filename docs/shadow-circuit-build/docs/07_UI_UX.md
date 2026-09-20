# 07 — Finished game shell and interaction states

## Visual language
Premium Shadow look: very dark surfaces, warm gold framing, clear light text, restrained glass, crisp icons, tactile press response. Mechanic colors remain readable. Avoid generic dashboard cards, tiny text, gratuitous gauges, animated noise over text, or a fake mobile-store home screen. Reuse the app's approved font stack. All text is real selectable DOM text unless it is physically part of a 3D prop; no generated-image lettering for buttons.

## State machine
`unmounted → brandedBoot → loadingEssentials → title → menu → levelIntro → playing → paused/focus → playing → dying → retry/menu` or `winning → results → nextIntro/menu`. Interruption paths include `rotateRequired`, `offlineMissingContent`, `storageWarning`, `assetFailure`, `rendererUnavailable`, `contextRecovery`, `syncConflict` and `updateReady`. Define valid transitions explicitly. Modal stack has one owner and restores focus/input safely.

## Screens and required behavior
| Surface | Content and complete interactions |
|---|---|
| Play launcher | Original game key art, name, concise descriptor; opens lazy game; unaffected neighboring cards |
| Branded boot | Shadow Circuit wordmark, recognizable original emblem, static fallback under reduced motion; no mandatory movie |
| Loading | Real task/byte phase progress, useful stage labels, Retry/Exit and offline handling; never fake 99% timer |
| Title/main menu | Continue when recoverable save exists; New Game; Campaigns/Level Select; Guide; Records; Settings; Codes; Credits; Back to Shadow Chat |
| New Game | Choose campaign/mode, explain preserve/restart progress; no destructive silent overwrite; cancel is safe |
| Campaign selector | Correct original/community/import labels, availability and provenance; blocked packs not falsely playable |
| Level selector | Actual complete source order, lock/cleared/assisted/best badges; fast virtualized listing; valid level-password entry |
| Level intro | Level number/name, actual objective count/time or untimed, mode badge, readable controls reminder and Start |
| Gameplay HUD | Required chips remaining, compact key counts/boot indicators, timer, pause, level identifier; color plus icon shape |
| Pause | Resume, Restart, Level Select, settings access, Help, Exit; show save/sync status without blocking offline play |
| Focus | Paused inspection, bounded zoom and quarter turns/reset; no free hidden-content reveal |
| Death | Cause-specific visual/sound, readable explanation, immediate Retry after short non-blocking beat; no long punishment animation |
| Results | Clear/assist badge, actual elapsed/move stats, clean personal best only, next/retry/select; save committed once |
| Campaign completion | Finished presentation, credited pack identity, real completion stats, replay/select; no false 100% when levels unverified |
| Guide/bestiary | All items/enemies, icon/model preview, exact rules for active compatibility profile, tap-friendly pages |
| Settings | Music/SFX volumes, effective Comfort, quality/battery mode, control size/mirror, camera reset; sensible defaults and restore |
| Records/achievements | Local/account personal stats; clean vs assisted distinction; no empty global leaderboard placeholder |
| Codes/passwords | Safe text fields, concise success/error, no accidental form navigation; source passwords and new assists distinguished |
| Credits/provenance | App/game authorship, community level contributors, reference acknowledgments, third-party licenses; no endorsement claim |
| Offline | Cached levels available; uncached state says so with reconnect/retry; never falsely “saved to cloud” |
| Sync conflict | Keep device runs distinct; explain available checkpoint choices without destructive overwrite |
| Update ready | Update at menu/after save, not midway through an active level |
| Unsupported/recovery | Human-readable reason and Retry/Exit; no blank canvas loop |

## Loading implementation
Show immediate DOM branding before JS engine initialization. Track stages: import engine, fetch essential files, validate/decode assets, instantiate scene/materials, prepare level, ready. Download bytes are real when measurable; unknown-length/compile tasks use indeterminate labels rather than fabricated percentages. Consider weights only when documented, derived from known sizes and clearly not a literal byte total. Start may unlock audio once the page receives a gesture. Cancel aborts network and ignores stale completion.

Use only one low-budget animated menu diorama; suspend it when hidden or reduced-motion policy requests. Freeze a static frame for overlays. No fully animated 3D world behind every submenu consuming GPU power. Render loading/menu backgrounds from original game art; they are an asset deliverable, not gradient placeholders.

## Feedback and pacing
Press responses <=one rendered frame when possible. Menu transitions roughly 120–180 ms, reduced-motion policy overrides. Collect effect emphasizes the actual item, not a screen-wide explosion. Block bump explains obstruction but cannot reveal hidden mechanics prematurely. Death transition approximately 350–600 ms, skippable by Retry after input debounce. Results ceremony approximately 1 second and skippable. These are design targets, not artificial delays to enforce.

## Accessibility and comfort
At least 48 px control targets, visible focus, icon/text labels, no information by color alone, pause help, reduced/no decorative motion, high-contrast solid surfaces, captions/text descriptions for important sound events. At 130% text, all menus remain scrollable and recovery buttons reachable. ARIA live only for meaningful events, not every tick. Support VoiceOver/TalkBack navigation in menus; do not claim complete nonvisual accessibility of spatial action puzzles without an actual alternative interaction design and testing.

## Achievement contract
Small, deterministic personal set: first clean clear; 10 clean clears; 50 clean clears; all available campaign levels clean; complete an untimed level; solve a level containing each required enemy family. Derive criteria from normalized metadata/state. Never award full-campaign achievement for an imported partial pack or a pack with an unresolved identity. Assist clears can have their own completion record but not masquerade as clean achievements. No server prizes or economy.
