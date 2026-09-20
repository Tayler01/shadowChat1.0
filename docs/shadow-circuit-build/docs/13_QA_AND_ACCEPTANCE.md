# QA and acceptance contract

Every requirement in `manifests/requirements.csv` needs implementation paths, test IDs/evidence and actual status in the project's living ledger. The packaged manifest is a plan, not evidence of passing tests. States: NOT_STARTED, IN_PROGRESS, PASS, FAIL, BLOCKED, NOT_RUN. Never conflate BLOCKED and PASS.

## Test layers
1. **Package tooling**: unit tests for the included DAT parser/download validation and schemas/manifests. Preparation results appear in `evidence/PACKAGE_VALIDATION.md`. These do not test a game that has not been built.
2. **Core unit/reference**: every tile, actor, movement sequence, collision phase, item count, PRNG decision, trigger order, hidden layer and timer boundary. Deterministic expected traces must come from contract/reference observations.
3. **Property/fuzz**: bounded random malformed imports; no out-of-bounds; serialize/restore equivalence; input/replay consistency; completed/dead state cannot resume moves; assisted cannot become clean via undo; illegal render edges impossible.
4. **Content integration**: each normalized level identified by hash; source field preservation; allowed tile coverage; links in bounds; actual win replay or manual evidence. Semantic warnings remain visible.
5. **Component/accessibility**: all screen actions, pending/failed states, keyboard focus, 130% text, ARIA labels, shared Comfort integration.
6. **Browser end-to-end**: actual production build in Chromium and WebKit; Play launch/back, touch sequences, loading/error recovery, sync/storage, screenshots.
7. **Physical mobile**: actual Safari/iOS installed PWA and Android Chrome/PWA, safe areas/orientation/touch/audio/background/thermal behavior. Simulators/emulation are not physical-device proof.
8. **Host regressions/security**: existing app tests, lazy bundle budgets, no changes to paused routes, no leaking saves across accounts, no broad database grants/caches.

## Representative interaction matrix
Test all 4 facings and relevant tile directions. Include:
- two actors attempting same cell / crossing positions / player collision with partially moved actor;
- block pushed onto water, bomb, trap, teleport, button, ice/force floor; blocked push while standing on a force floor;
- boots gained/lost while moving, reusable green key vs consumed keys, chip count at socket, exiting on timer boundary;
- reverse tank during movement, clone multiple times same tick, occupied clone exit, held trap/button, actor order after clone/remove;
- consecutive teleports with blocked exits and actors; hidden wall discovery without camera spoilers;
- full-board movement, actor count stress, random behavior with same seed across pause/restart/snapshot;
- keyboard+D-pad overlap, two touches on different controls, diagonal sectors, finger leaves screen, pointer cancel, losing app focus mid-step;
- app switch before/after save commit, storage unavailable/quota, content updated while suspended, account switched with pending outbox;
- unknown pack identity, source field duplicates, invalid link coordinates, ZIP bomb/path traversal, missing texture/decoder/audio.

## Device/profile matrix
| Target | Modes | Required coverage |
|---|---|---|
| Physical iPhone 16 Pro Max | Safari tab, installed PWA | High-tier performance, notches, audio, gestures, background/lock, sustained play |
| Physical iPhone 11/12 class or disclosed substitute | Safari tab, installed PWA | Baseline quality, memory/reload, landscape comfort |
| Real midrange Android (record model/RAM) | Chrome tab, installed PWA | Baseline perf, back gestures, orientation permission, audio, multi-touch |
| Desktop XPS | Current Chromium + keyboard | Tooling, functional fallback, resize, inspector/capture |
| Playwright Chromium/WebKit | Portrait and landscape profiles | Repeatable DOM/navigation/error regression, not thermal certification |

Required events: incoming notification/app switch; lock/unlock; browser back; browser chrome expand/collapse; rotate twice while loading/playing; deny fullscreen/orientation; disconnect/reconnect Wi-Fi; mute/unmute; low-power mode; reload mid-level; offline launch of cached and uncached packs. No control under safe-area/notch; no global zoom disable. Full play area visible with large text/control profiles.

## Evidence naming
`evidence/shadow-circuit/<build-hash>/<phase>/<test-id>/` with JSON metadata, command/stdout/exit code, screenshot/video when useful, and device/network info. Sanitize tokens/account personal data. Record elapsed duration as observed, never estimated. A generated screenshot without actual gameplay is not browser QA evidence. Save a scene state/seed/replay hash for reproducible bugs.

## Release acceptance
All required functionality implemented; no placeholder core art; no inert UI; no missing required tile/enemy; all source-level status known; no release-blocking or major unmitigated defects; protected app tests/budgets pass; local save recovery and RLS isolation pass; runtime assets and source rights approved for deployment; actual target device tests pass. If original campaign or physical checks remain blocked, label the candidate accordingly—never report full requested delivery.

A full-campaign run means every level has a valid completion trace/manual proof for the shipped rules/content version. Imported pack count and parser success are insufficient. No global promise of zero bugs; the claim supported here is that defined acceptance tests passed and no known release-blocking defects remain at the documented build.
