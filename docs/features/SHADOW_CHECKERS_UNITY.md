# Shadow Checkers Unity rebuild

Started September 13, 2026. The user now requests production replacement as quickly as possible, with routine screenshots disabled. Release preparation is underway through the main-only production workflow.

## Accepted visual direction

The user rejected the initial flat-looking table. Target: tangible silver and black marble pieces, a polished marble/glass board with actual scene reflections and contact shadows, on a wooden table in a medieval study. Perspective and room depth are essential; overhead is optional. Do not mark the visual milestone complete from the original prototype screenshots.

User supplied three chess reference photographs on September 13. They establish the study and rendering target, not a change to chess rules or chess pieces. Photo 2 sets the main composition: low perspective across a substantial desk, carved dark wood, an ornate hearth, tall bookcases, maps and restrained pools of candlelight. Photo 1 sets close material detail and soft background depth. Photo 3 establishes a fully furnished room at wider angles. Keep silver/black veined marble checkers and a polished marble/glass board; replace the bright, sparse, blocky prototype room. Reference files remain in the user's original attachment folder `0562A2E2-BCA8-4526-8AC6-1C773C2BB095`.

## Checkpoints

### Phone-only landscape contract

The user explicitly requires phone-only, landscape-only play matching Shadow Runner. Request a landscape orientation lock on game load; when a browser denies programmatic locking (including iPhone Safari), block portrait play behind a rotate gate. Share Runner's existing viewport/orientation settling logic. Landscape gets a compact turn/header bar, full-width Unity study and a toggleable chat side panel. Respect all four phone safe areas. Do not claim a web page can physically rotate an iPhone.

Background detail is being rebuilt as original 3D furnishings with offline Cycles lighting baked into shared texture atlases. Live board reflections and piece shadows remain dynamic. Combined piece meshes reduce draw calls. The 1024/512 web texture tier reduced the first complete Unity runtime from 17.2 MB to 7.7 MB; app download budget passed at 91.94 MiB. Recheck after adding the new study.

### Cinematic contract

The user requested an animated room reveal and zoom to the board on game load, animated movement throughout, and distinct capture and kinging events. Implemented source has a skippable 3.4-second room-to-board camera move, 0.46-second grounded slides, 0.58-second arcing capture hops with victim removal timed to the jump, a landing ripple, and a separate solid upper marble tier descending onto a newly crowned king. Shared reduced-motion preferences bypass camera travel and movement effects. Pause the room reveal while the portrait gate or background tab hides play. Input is blocked during presentation motion; authoritative state remains owned by the host/server. Runtime footage and event timing passed in the cinematic fixtures cited below.

All checkers action feedback uses the local `CheckersNotice` panel instead of the global app toast: dark glass/solid backing, antique-gold border, serif text and restrained sword/shield iconography. Server-confirmed moves read “Your move is played”. One notice replaces the previous one; success lasts 2.4 seconds, errors 6 seconds, and a 44px dismiss control remains available. Notices live inside the game root for fullscreen support and respect the shared motion, contrast and transparency settings.

Notice verification passed in headed Android/Chromium (`multiplayer-1789331154237`) and iPhone/WebKit (`multiplayer-1789331261359`): blocked-piece reminder, manual dismissal, server-confirmed move notice, both players' moves and chat. Screenshots were reviewed and exact created matches cleaned. Latest notice build, lint, TypeScript and the two affected component/screen suites passed.

### Current verification limits

The first iPhone/WebKit run passed authoritative touch moves and chat, but its WebGL screenshots were black. The latest completed build renders correctly in headed WebKit, including the authenticated two-player match; the earlier black capture's exact cause was not isolated. Android's first touch run missed a short tap; native-frame polling was replaced with direct canvas pointer delivery to Unity. A subsequent landscape run found a stale runtime manifest during a concurrent Unity/app build. The Unity build now publishes its matching hashed manifest itself and uses a build-running marker so app packaging cannot start midway. Both phone engines passed against the finished September 13 build; physical hardware and performance validation remain open.

1. Original Blender meshes, Unity scene, lighting and visible Web preview.
2. Versioned host/Unity bridge, server-confirmed moves, all original lobby/match features, accessibility and lifecycle handling.
3. Rules/bridge tests, authenticated two-player verification, desktop/phone browser review, build gates and screenshots.

## Feature parity contract

| Feature | Implementation contract | Verification |
| --- | --- | --- |
| Rules | Existing American-checkers engine and authoritative move RPC; no client-owned winners | Engine tests and two server-persisted moves passed |
| Public tables | Create, join, continue, watch; both board skins and eight characters | Create/join and duplicate-character rejection passed; remaining flows retained in existing source |
| Match play | Real 3D meshes, touch selection, mandatory capture, multi-jump, kings, hints, previous move | Both players' touch moves and capture/king fixtures passed |
| Social | Existing temporary chat, queue, rematch and next challenger | Two-account chat passed; queue/rematch retained, not re-exercised |
| Results | Resign, cancel, admin removal, statistics, Hall of Fame and crown | Existing source retained; ranked completion deliberately not exercised against live statistics |
| App integration | Existing auth, exact-match routes, unread counts and turn notifications | Auth and exact-match routes passed; notification tests passed |
| Comfort | Shared reduced-motion policy; keyboard/screen-reader board controls; phone safe areas | Component/orientation tests and landscape browser checks passed; physical phones pending |
| Reliability | Load progress/retry, dispose WebGL on exit, no double move submission, stale event rejection | Bridge/component and audio lifecycle tests passed |

## Architecture

`native/shadow-checkers-unity` contains original editable Blender assets and Unity 6000.3.24f1 source. Unity owns the scene, camera, rendering and raycast input. ShadowChat owns authenticated data access, realtime subscriptions, legal moves and the existing social screens. A same-origin iframe isolates the Web runtime and releases it when leaving a match. The versioned bridge accepts only its own frame, origin, revision and current legal choices. No credentials are sent to Unity.

The original board remains available as explicit accessible controls and as a recovery option if WebGL cannot load. Runtime files load only upon entering a match. No backend schema change is planned.

## Evidence

### Release preparation

The Windows Playwright WebKit runtime exposes neither `AudioContext` nor `webkitAudioContext`; its sound probe cannot establish Safari audio behavior. Both gameplay engines passed, and actual Chromium fire/contact playback passed. Frame touch release now also resumes audio directly within a user gesture. Physical iPhone sound, installed-PWA behavior and sustained mobile performance remain unverified. Reference-level visual realism remains unfinished.

Release audits exposed nine existing dependency findings. Sharp was patched to 0.35.4 and compatible lockfile updates removed all npm audit findings; the paused News worker audit was already clean. No worker runtime was resumed. Jest discovery is bounded to application/test roots so Unity caches and local media evidence do not stall test discovery.

### Living fire and sound, September 13

The rebuilt hearth has textured masonry and three layered, blended fire planes using an original generated eight-frame atlas. Five candle flames animate independently with a warm core and small natural drift. A single clock controls flame evolution and gentle light variation; it stops for reduced motion and hidden/portrait-paused play. The fireplace moved beside the desk so flames remain visible from the normal board camera. Baked room lighting and shared atlases remain in use.

The exact original `heart-of-courage.mp3` is unchanged (working-tree and HEAD blob `51c438d8f7a6ceb5330a5b3e8385894b9d25d02b`). Only checkers playback gain changed from 0.42 to 0.11; other entertainment soundtracks keep their prior gain. Study effects use a 23-second crossfaded real fireplace recording, four softened contact recordings with no adjacent repeat, occasional softened slides adapted from the original checkers move sound, and slightly heavier king placement. Native animation emits each cue at its landing/capture point. The shared game-SFX preference controls both fire and pieces through the in-game Sound button; original music remains separately controlled.

Audio source credits and transformations: `public/games/shadow-checkers/audio/CREDITS.md`. Generated flame provenance and exact prompt: `native/shadow-checkers-unity/ArtSource/hearth-flames-prompt.md`; built-in image-generation tool, retained original plus project-owned texture copy. No new production dependency.

Checks: latest Unity/app builds, lint and TypeScript pass; 12 affected Jest tests pass. Deploy payload is 93.65 MiB. `node scripts/verify-shadow-checkers-audio.mjs` verifies mute-during-load, single loop, nonrepeating placements, pause and disposal. Actual Chromium fixture audio was recorded at `sounds-1789333059604/actual-fire-and-capture.mp3`; four contact sources started at the two capture/landing pairs, and mute suspended the audio context. Flame footage and pause comparison are in `flames-1789333332330`: active mean pixel difference 0.190302, paused 0.00000269. Latest headed WebKit two-player flow passed in `multiplayer-1789333446586`, with exact test-match cleanup. Physical-phone audio mix, frame rate and thermal behavior remain unverified.

The first authenticated two-player browser run passed real Unity canvas input, server-persisted moves, recipient realtime turn update and reply move, and temporary match chat. Exact test session cleanup passed. Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1789327105272/summary.json`. An earlier headed test missed recipient input when its window was not foreground; bringing each player window to the front resolved the automation failure.

Six focused suites (27 tests) passed for engine, bridge, renderer component, screen, notifications and the shared landscape gate. Latest lint, application TypeScript and production build pass; total deploy payload is 93.76 MiB. Visual quality remains in progress against the supplied references. Browser emulation will not be represented as physical-device PWA proof.

The September 13 cinematic fixture run recorded the real Unity Web player at a landscape Pixel 7 viewport. Opening, a legal double capture and a capture that crowns a king completed with no page errors. Recorded bridge events returned to ready after each sequence, including the distinct kinging stage. Evidence: `output/playwright/shadow-checkers-unity/cinematics-1789330399443/summary.json`, with opening/capture/king WebM recordings and a shareable H.264 `king.mp4`. This is an isolated gameplay fixture using the existing rules engine; authenticated multiplayer and physical-phone performance are separate checks.

Latest authenticated mobile runs passed on Chromium/Pixel 7 emulation (`multiplayer-1789330477633`) and headed WebKit/iPhone 13 emulation (`multiplayer-1789330714568`). Both verified portrait gate to landscape, two server-persisted canvas touch moves, recipient realtime turn update, player-two coordinate mapping, temporary chat, width containment and camera controls. Exact created match cleanup passed in both runs. Reviewed WebKit study screenshots contain the actual rendered scene. These runs do not prove physical iPhone orientation-lock policy, thermal behavior or frame rate.
