# Shadow Checkers Unity rebuild

Started September 13, 2026. The initial replacement was deployed with user authorization that day. September 24 material, sound, room-tour and prop polish is local; it has not been pushed or deployed. Routine screenshots remain disabled except focused visual validation. Future release work follows the main-only production workflow.

## Accepted visual direction

The user rejected the initial flat-looking table. Target: tangible silver and black marble pieces, a polished marble/glass board with actual scene reflections and contact shadows, on a wooden table in a medieval study. Perspective and room depth are essential; overhead is optional. Do not mark the visual milestone complete from the original prototype screenshots.

User supplied three chess reference photographs on September 13. They establish the study and rendering target, not a change to chess rules or chess pieces. Photo 2 sets the main composition: low perspective across a substantial desk, carved dark wood, an ornate hearth, tall bookcases, maps and restrained pools of candlelight. Photo 1 sets close material detail and soft background depth. Photo 3 establishes a fully furnished room at wider angles. Keep silver/black veined marble checkers and a polished marble/glass board; replace the bright, sparse, blocky prototype room. Reference files remain in the user's original attachment folder `0562A2E2-BCA8-4526-8AC6-1C773C2BB095`.

September 24 clarification: close detail is required across the tabletop books, shelf books, table wood grain, candleholders, wax, drinking vessel and maps. These must hold up during the room reveal and board close-up, not merely form distant silhouettes. Keep worn leather/tooling and individual page edges, directional wood grain, worked and tarnished metal, wax drips and translucency, and parchment/engraving detail as explicit acceptance items. Smooth mobile operation remains part of that acceptance.

## Checkpoints

### Recover the running player after host refresh (September 27)

Validation: lint, TypeScript, app build and scoped whitespace checks pass; payload 99,794,928 bytes remains below 100 MB. Accelerated Windows WebKit navigation/capture and real WebGL-context-loss retry pass (`resume-webkit-1790483546588`), preserving the captured position and working overhead view. Foreground revision `ready-handshake-20260927`; no native rebuild, push or deployment. Real-phone validation remains open.

Reproduced a development-session failure in an actual Unity iframe: Vite Fast Refresh reattached the host effect, resetting its local `loaded` flag, but the retained player had already emitted its one-time ready event. The host watchdog then removed a healthy player. `refresh-1790483423891` fails with one ready event and the failed-player UI; source bytes remain unchanged because the diagnostic only touches file metadata. Its watchdog is accelerated after initial startup to make the same timeout path practical to test.

`ShadowCheckersUnityBoard.tsx` now requests readiness when attaching listeners. `frame.js` acknowledges only a fully started, undisposed player, letting the host provide its current snapshot instead of replaying old frame state. `refresh-1790483494645` passes: same iframe/time origin retained, two ready events, no failed-player UI and working overhead command. Ten frame-lifecycle tests and 25 screen/board tests pass, covering requests during initialization/disposal and latest-state replay boundaries.

This establishes and fixes a false host timeout after live updates. The separate `MeshCollider` console message observed in the long-lived preview has not been independently reproduced, so do not claim its engine-level cause is proven by this test.

### Invisible camera gestures and themed confirmations (September 27)

Foreground follow-up: the long-lived in-app preview showed a Unity `MeshCollider` initialization error after live updates; Retry did not recover that attempt. A full navigation to revision `invisible-camera-20260927` restored the player and its ready state. The cause is not established; retain this as a reload/recovery investigation rather than treating separate clean-browser passes as proof against it.

At the user's request, the camera touch strip now overlays the full-width 3D room transparently. Removed its panel, border, icon and instruction labels; the iframe fills the entire game viewport. Drag/pinch and keyboard controls remain, with instructions in the small camera-help control. The overlay yields pointer events when disabled. A focus outline appears only for keyboard focus. Source: ShadowCheckersCameraSurface.tsx, ShadowCheckersUnityBoard.tsx and src/index.css.

Actual Unity camera QA passes Chromium (`camera-chromium-1790482916976`) and accelerated Windows WebKit (`camera-webkit-1790483020586`): full-width room, transparent unlabeled overlay, all default playable square centers clear of the overlay, drag/tilt/zoom/reset/overhead, and 44 px corner targets at 915x412 and 667x320. Chromium two-finger touch injection passes; WebKit uses keyboard zoom and does not prove physical Safari pinch. Reviewed `camera-chromium-1790482916976/controls.png`.

The match-flow review also replaced existing browser resignation/cancellation confirmations with themed dialogs in ShadowCheckersScreen.tsx. They retain explicit confirmation, initially focus the safe action, trap keyboard focus, restore it on dismissal, block duplicate pending actions and show retryable errors inline. Match input is disabled while a confirmation is open. No backend action contract changed.

Twenty-five focused screen/board tests pass. Chromium (`layout-chromium-1790482943887`) and WebKit (`layout-webkit-1790483056416`) pass four phone/text profiles including 667x320 at 130%, exact resign/cancel dispatch, dismissal/focus and touch targets. Actual Unity capture/result/rematch passes after dismissing resignation (`ending-chromium-1790483091884`). Lint, TypeScript and app build pass; app payload 99,794,656 bytes stays below 100 MB. No native rebuild was necessary. Local only; no push/deployment. Physical-device, final photographic fidelity and hosted continuation validation remain open.

### Candle light follows integrated visible glow (September 27)

Validation: native build 11,521,595 bytes; lint, TypeScript, app build and Unity console checks pass. App payload 99,793,027 bytes remains below the unchanged 100 MB limit. Accelerated Windows WebKit opening/overhead/reset passes (`material-webkit-1790482411342`). Foreground revision `candle-energy-20260927`. Generated scene/settings restored; no push/deployment. Physical-phone and final visual acceptance remain open.

Extended `Editor/FlameLightingDiagnostics.cs` with a linear HDR optical-energy check: isolate/render all eight flames at 32 times (256 renders), compensate for probe framing and compare normalized visible energy against the six local light intensities. This avoids tone-map clipping hiding bright-core changes. The original candle setting failed: maximum normalized brightness mismatch was 3.5854%, because the shader changed both radiance and flame height while the light used only radiance.

`MedievalStudyEffects.cs` now includes that existing height scale in candle intensity, shared with the source position. Maximum candle mismatch drops to 0.0182%; the three-tongue hearth remains within 1.363%. All 45 position-alignment samples and pause/reduced-motion checks still pass. No added light, texture, geometry, shadow map or render pass. Evidence: `output/shadow-checkers-unity/flame-energy-before-20260927.json`, `flame-energy-checks.json` and `flame-lighting-checks.json`. This is rendered-source synchronization, not a claim of full physical room GI.

### Batch piece shadows without reducing lighting (September 27)

`Marble.shader` now generates its own shadow caster with the same instancing properties as the visible piece material. Previously its Standard fallback submitted each piece separately. No light, shadow-map resolution, reflection resolution or geometry was removed. This follows Unity's documented [generated instanced shadow pass](https://docs.unity.com/en-us/engine/6000.0/manual/materials-and-shaders/built-in/shader-built-in-birp/shader-standard-particle-shaders/particle-system-optimization/gpu-instancing-surface-shader) pattern.

The rendering diagnostic now supports `--passes`: one WebGL draw/program trace collected after timing so expensive state inspection does not contaminate cadence samples. Before (`render-chromium-2-1790481488779`): 758 draws/frame, 437 depth/shadow draws, zero instanced shadow draws. After (`render-chromium-2-1790481694981`): 511 draws/frame, 190 depth/shadow draws, 37 instanced shadow draws. Total submissions fall 32.6%. Desktop cadence remains about 31 submissions/sec with 38.9 ms p95; this does not establish a phone FPS improvement. Reviewed the new landscape render with reflections and contact shadows intact.

All 45 native flame/light optical alignment samples pass, including frozen pause/reduced-motion clocks. Accelerated Windows WebKit opening/overhead/reset, capture and kinging pass (`material-webkit-1790481790996`). Native build succeeds at 11,522,871 bytes; lint, TypeScript and app build pass. App payload is 99,794,303 bytes, within the unchanged 100 MB budget. Generated scene/settings were restored after checking that the scene had no unsaved changes. Local preview revision `instanced-shadows-20260927`; no push/deployment. Physical-phone performance and final photographic fidelity remain open.

### Restore player details during a match (September 26)

The actual iframe regression check found that tapping a visible checker while the menu was open selected that checker and left the menu open (`ending-chromium-1790480902674`: revision 2 to 3, one square event). A transparent outside-tap button now consumes that gesture, closes the menu and returns focus to its toggle. Escape also works from the toggle. The fixed Chromium check (`ending-chromium-1790480998964`) retains revision 2 with zero square events, then passes a normal capture, result ordering and rematch dispatch. Fourteen focused screen tests pass.

Accelerated Windows WebKit also passes the outside-tap guard, subsequent capture, result ordering and rematch dispatch (`ending-webkit-1790481089504`): zero square events and unchanged revision during dismissal. Final lint, TypeScript, production build and scoped whitespace checks pass. App payload is 99,792,519 bytes, within the unchanged 100 MB budget. No native player rebuild was needed for this interface-only change.

The compact landscape view had placed both original player cards inside a permanently hidden section. `ShadowCheckersScreen.tsx` now exposes them in the game menu: player names, selected character portraits/names, champion badge under the existing visibility rule, silver/black piece counts and the active turn. The board remains clear. The menu is bounded to the safe-area-aware viewport, scrolls on short screens, provides 44 px menu targets and supports Escape with focus returned to its toggle. The old turn graphic no longer covers the detailed menu card.

Thirteen focused screen tests pass, including live count/turn updates, singular piece text, character/badge visibility and Escape focus. Expanded layout QA passes all four landscape/text profiles in Chromium (`layout-chromium-1790480403699`) and WebKit (`layout-webkit-1790480451043`), including 667x320 at 130% text, both player cards and scrolling to every menu action. Actual Unity Chromium capture/king/reduced-motion endings, result ordering and rematch dispatch pass (`ending-chromium-1790480524882`); the final singular-label/character fixture also passes (`ending-chromium-1790480685796`). Its `player-menu.png` was reviewed. These use isolated auth/data/actions and do not prove hosted settlement or real-phone behavior. No push/deployment.

### Architectural walnut grain (September 26)

Validation: Unity build 11,521,087 bytes; app 99,791,567 bytes within the unchanged 100 MB budget. Lint, TypeScript and app build pass. Chromium `render-chromium-2-1790479862999` retains 758 draws/frame, 32.72 submissions/sec, 38.8 ms p95 and no >50 ms intervals; landscape render reviewed. Accelerated Windows WebKit opening/overhead/reset passes (`material-webkit-1790479907450`). Preview revision `architectural-grain-20260926`; no push/deployment. Physical-device and final visual acceptance remain open. App payload headroom is now 208,433 bytes; further assets require measured optimization rather than raising the budget.

The wall panels, shelf rails, mantel and other baked wooden framing lost fine grain in the room-wide lighting atlases. `study_details.py` now creates a wood-only vertex mask and independent detail UVs aligned with each structural member. `create_study.py` preserves those coordinates as UV1 while keeping baked radiance in UV0. Non-wood books, stone and other materials are masked out.

`BakedStudy.shader` restores grain from the existing mipmapped oak photograph, normalized against a blurred sample so the wood tint is not multiplied twice. It preserves baked light/shadow structure and adds no renderer, material, light or texture asset. `MedievalStudy.cs` binds the existing photograph to the two baked-room materials. Blender source, both room models and lighting atlases were rebuilt successfully. Native imports retain one submesh each and contain both UV channels plus the material mask (architecture 95,490 vertices; furnishings 3,896).

Native close-up reviewed: `output/shadow-checkers-unity/room-grain-native.png`. The controlled strength-off/on comparison changes surface detail while mean image brightness stays within 0.1%; shader compilation and console checks pass. This improves close room surfaces, not proof of final photographic fidelity.

### Candle source movement follows the visible flame (September 26)

Unity build succeeds at 11,282,608 bytes. Lint, TypeScript and app build pass; app payload is 99,553,088 bytes within the existing 100 MB budget. Chromium profile `render-chromium-2-1790479123546` retains 758 draws/frame, 32.37 submissions/sec, 38.8 ms p95 and zero intervals over 50 ms. Accelerated WebKit opening/overhead/reset passes (`material-webkit-1790479165576`). Foreground revision `flame-source-motion-20260926`; no push/deployment. Physical-device performance and final photographic fidelity remain open.

`MedievalStudyEffects.cs` now sends the candle lean to `StudyFlame.shader` and places each local light inside that same moving luminous body. The nearby candle's existing soft shadow responds to source motion; the other candles keep their existing vertex-light budget. No new lights, shadow maps or passes are added. This corrects the previous fixed-position source, whose brightness changed while the visible flame leaned separately.

`Editor/FlameLightingDiagnostics.cs` isolates and renders all five candle shaders at nine times, measures their luminous pixel centroids and compares them with projected light positions. Its first measurement exposed a vertical source offset; the corrected source height passes all 45 samples with maximum horizontal error 0.001063 and vertical error 0.000354 scene units. Source travel stays subtle (0.01289 scene units in the sampled interval), and both pause and reduced-motion clocks stay frozen. Evidence: `output/shadow-checkers-unity/flame-lighting-checks.json`. This validates the rendered source alignment, not full real-time room GI or independently moving shadows from every candle.

### Natural charcoal and synchronized hearth response (September 26)

`StudyCharcoal.shader` now keeps most large-log fissures dark, with irregular patches of low orange heat, elongated wood checks and mottled ash. The logs receive warm light from the same fireplace energy signal used by the visible flames and room. `StudyHearth.cs` gives the cut ends separate radial UVs and flat normals, eliminating stretched bright stripes. The combined mesh remains one renderer (2,910 vertices); no new light, texture or render pass was added. Reviewed `output/shadow-checkers-unity/charcoal-native.png`.

Unity shader compilation and build pass (11,287,084 bytes). Lint, TypeScript and production build pass; the app remains 99,557,564 bytes under the unchanged 100 MB budget. Chromium profile `render-chromium-2-1790478415965` measures unchanged 758 draws/frame, 31.60 submissions/sec, 38.7 ms p95 and no intervals over 50 ms. Accelerated Windows WebKit opening/overhead/reset passes (`material-webkit-1790478487167`). Foreground preview revision `natural-charcoal-20260926` is loaded. This remains a local visual improvement, not proof of photo-level realism or physical-phone performance. No push/deployment.

### Dedicated hearth stone detail (September 26)

Validation: Unity build 11,287,423 bytes; app 99,557,903 bytes, within the unchanged 100 MB budget. Lint, TypeScript, production build and scoped whitespace checks pass. Chromium rendered-scene review/profile (`render-chromium-2-1790477634119`) measured 758 draws/frame, eight more than the previous view, 31.35 submissions/sec, 38.5 ms p95 and no intervals over 50 ms on desktop Intel Arc. Accelerated Windows WebKit opening/overhead/reset passes (`material-webkit-1790477652339`). Foreground preview revision `hearth-stone-20260926`; no push/deployment. Physical-phone GPU, thermal and memory proof remain open.

The hearth masonry, slab and jambs previously shared the room lighting atlas, which flattened their surface grain. `ArtSource/study_details.py` now separates them into `StudyStone`, assigns spatial UVs, subtle age/soot tint and baked vertex contact shading, and publishes the existing CC0 stone color/normal photographs. The complete Blender study and atlases were rebuilt successfully with `--python-exit-code 1`.

`MedievalStudy.cs` assigns one shared rough limestone material to the 8,149-vertex stone mesh. Its dedicated color texture is 1K and normal texture 512 px in WebGL. `StudySurface.shader` adds a localized, mottled soot plume with reduced surface polish; other materials leave this feature disabled. The masonry now receives actual animated local firelight rather than only the baked room-light modulation. `TextureImport.cs` preserves the stone edges with low mesh compression. Asset provenance is updated in `ArtSource/THIRD_PARTY_ASSETS.md`.

Reviewed native close-up: `output/shadow-checkers-unity/hearth-stone-native.png`. The native shader compiles without errors, and the shared stone model imports as one renderer. This improves surface detail and dynamic lighting response; it does not establish final photo-reference fidelity or physical-phone performance.

### Continuous steep camera tilt (September 26)

The gesture camera previously clamped only its height, which stopped the actual viewing angle at 41.53 degrees while the requested pitch continued to 65. `ShadowBoard.UpdateCamera` now follows a board-centered arc constrained to the room volume, and uses optical zoom so reaching the ceiling constraint does not disable pinch zoom. Reset composition and room-tour endpoint remain the same.

`CameraDiagnostics.cs` verifies 216 combinations of aspect, heading, pitch and zoom: actual pitch matches all requested angles from 20 to 65 degrees, the lens remains below Y=9.8 and within the wall limits, and zoom reverses correctly at steep tilt. Expanded `PointerDiagnostics.cs` passes 240 raised-piece and 960 empty-destination checks, including steep view for both players, ordinary pieces and kings. Browser regression checks explicitly pass the old 42-degree plateau and verify zoom there, then exercise pinch/reset/overhead and both phone-size layouts: `camera-chromium-1790476777529`, `camera-webkit-1790476790688`. Chromium tests actual CDP two-finger input; WebKit tests drag and keyboard zoom. Lint, TypeScript and app build pass. Unity payload: 10,590,462 bytes. No push/deployment; physical-device validation remains open.

### Left-side camera gestures, portrait and synchronized flame light (September 26)

Final local build: Unity 10,591,181 bytes; app 98,861,661 bytes, within the 100 MB budget. Lint, TypeScript, production build, documentation integrity and scoped whitespace checks pass. Final shader build also passes accelerated WebKit opening/overhead/reset (`material-webkit-1790476189397`) and Chromium rendering profile (`render-chromium-2-1790476172345`): 30.71 submissions/sec, 750 draws/frame, 38.8 ms p95, no intervals above 50 ms. Foreground preview refreshed with revision `gestures-flamelight-20260926`. No push or deployment; physical-phone thermal/GPU/audio and photo-level visual acceptance remain open.

The camera has a dedicated full-height left area, separated from the playable iframe. It reuses Shadow Circuit's pointer-membership and pinch logic: drag horizontally to orbit, vertically to tilt, spread/pinch to zoom; keyboard arrows, plus/minus and Home remain available. Native limits keep the lens below the ceiling and within the room. The bottom view toolbar is removed. Small upper-right buttons expose camera help, shared study sound and the accessible board; reset and overhead live inside help. Gestures are disabled during cinematics, pause, help and failed loading, and the frame rejects malformed/paused deltas.

`StudyPortrait.cs` adds an original generated scholar painting in a modeled walnut/brass frame (three meshes, 116 vertices). Its back clears the existing wall battens; the first native render caught and corrected an intersection. `StudyPortrait.png` is imported at 512 px with mipmaps and ASTC for WebGL. Source/provenance is recorded in `ArtSource/THIRD_PARTY_ASSETS.md`.

`MedievalStudyEffects.cs` now shares each candle's pulse between visible flame and local point light. The fireplace light follows measured luminance of the same eight animation frames and matching interpolation/phases. All five candle positions have local lights; one nearby candle adds a 128 px soft shadow cubemap, with distant candles using vertex lights. `BakedStudy.shader` applies restrained, localized modulation of existing baked radiance using these same signals. This preserves baked shadow structure and approximates fluctuating bounce; it does not implement full realtime global illumination or independently moving shadows from every candle. Hidden/reduced-motion clocks stay frozen. Native sampling at 60 times found candle/light mismatch below 0.000001, matching room uniforms and paused-clock freeze; both shaders compile cleanly.

Fourteen host/bridge tests plus twelve lifecycle/shared-gesture tests pass. Camera browser runs `camera-chromium-1790475719398` and `camera-webkit-1790475879928` pass at 915x412 and 667x320: isolated drag, zoom, reset, overhead, complete reset board framing and 44 px corner targets. Chromium uses actual two-finger CDP touch; mobile WebKit uses drag/keyboard zoom because Playwright cannot inject mobile WebKit wheel input. Physical iPhone pinch remains unverified. Chromium capture/kinging/pause checks also pass (`material-chromium-1790475895549`). The first lighting build measured 30.70 submissions/sec, 750 draws/frame, 38.7 ms p95 and zero intervals over 50 ms on desktop Intel Arc (`render-chromium-2-1790475775221`); this is not physical-phone performance proof.

### Release and retry a failed graphics player (September 26)

`frame.js` now shares one idempotent disposal path for permanent unload, startup failure and WebGL context loss. It releases study audio and Unity, cancels pending pointer input, suppresses late callbacks and cleans up a player that resolves after failure. `ShadowCheckersUnityBoard.tsx` removes the failed iframe, disables camera controls, clears stale cinematic UI and ignores subsequent events from that frame. Retry creates a new player and sends the latest host snapshot; it does not reset the match.

Seven lifecycle tests and thirteen host/bridge tests pass, including duplicate failure events, context loss during loading, stale-pointer rejection and a retry after the match state changed. The existing resume QA now supports `--context-loss`: it submits a double capture, calls the actual `WEBGL_lose_context` extension, verifies removal/disabled controls, retries, compares the exact pieces/latest move, waits for presentation and verifies overhead framing. Chromium (`resume-chromium-1790474301950`) and accelerated Windows WebKit (`resume-webkit-1790474342597`) pass without page errors. Lint, TypeScript, app build and source/dist frame hash pass; app 98,784,382 bytes, within budget. No native rebuild, push or deployment. Physical-device memory pressure and OS eviction remain separate, unverified conditions.

### Preserve the player across cached page suspension (September 26)

`public/games/shadow-checkers/unity/frame.js` previously quit Unity and disposed the audio controller on every `pagehide`, including `persisted` events for back/forward-cache entries. It now pauses retained pages and resumes them on persisted `pageshow`, then requests the host's latest snapshot through the existing ready handshake. Portrait/host and visibility pause gates remain independent. Suspension cancels pending pointer presses. Permanent unload disposes once, ignores late events, and releases an instance that completes loading after the page has gone away.

Five Node lifecycle tests cover retained suspension, fresh-snapshot request, stale press cancellation, layered pause gates, permanent disposal and both startup races. Twelve existing host/bridge tests and the audio lifecycle verifier pass. Lint, TypeScript, app build and source/dist frame hash pass; app 98,784,256 bytes. No Unity native rebuild was needed.

New `scripts/shadow-checkers-resume-qa.mjs` exercises persisted events against the actual Unity iframe and separately performs browser history navigation followed by a touch-driven capture. Chromium (`resume-chromium-1790473870886`) and accelerated Windows WebKit (`resume-webkit-1790473906341`) pass without page errors. Both actual history returns performed fresh reloads (`historyUsedCache: false`); this is not evidence of real cached restoration. Physical-device cache eligibility, OS sleep/process eviction and audio recovery remain open. Local only, no push/deployment.

### Balance travel and turning during the entrance (September 26)

An audit of the actual camera rail found a 109.64 degrees/second peak turn at 3.15 seconds. Position-only distance sampling rushed the change of focus toward the library. `ShadowBoardCinematics.cs` now builds its timing table from combined translation and rotation (rotation measured along a six-unit camera arm). The route, focus targets, single global easing curve and 12-second duration remain intact; no stop is introduced at an intermediate viewpoint.

Sampling the production `TourDistances` helper at 60 Hz gives a peak turn of 49.91 degrees/second, versus 109.64 before. Peak translation rises from 5.32 to 6.60 world units/second as time is redistributed toward the turn. The timing table stays strictly increasing and the final position differs from the requested endpoint by only 0.00000153 units. Evidence: `output/shadow-checkers-unity/camera-motion-audit.json` and `camera-motion-balanced.json`. These geometric measurements do not establish subjective cinematic quality or device frame pacing.

The bridge retried a timed-out direct build command, causing redundant builds. `ShadowCheckersBuild.cs` now guards request IDs inside `BuildWeb`, across assembly reloads; the menu wrapper clears the automation request so deliberate menu builds remain available. A direct repeat-request check confirms no new build or status-file change. Use a new request ID for an intentional automated retry. Final Unity build: 10,518,617 bytes; app: 98,783,380 bytes, within budget. Lint, TypeScript, app build and four source/dist hashes pass. Generated Editor scene/settings restored.

Chromium tour/audio QA passes (`tour-audio-1790473315100`): entrance 12,114.8 ms, original music decoded and playing at gain 0.11, play/mute controls working, no page errors. Its `room-tour.webm` is retained for review. Windows WebKit entrance/overhead/reset passes (`material-webkit-1790473385116`); Chromium opening, capture, kinging and pause/resume also pass (`material-chromium-1790473478817`). The foreground local preview is open. No push/deployment; physical phones and subjective visual/motion acceptance remain open.

### Skip unseen board reflections during the room tour (September 25)

`PlanarBoardReflection.cs` now tests a conservative bounds around the two reflective tile meshes against the source camera's frustum before rendering the secondary camera. The six-plane array is reused, avoiding per-frame allocation. When the board leaves the shot, the reflection pass is skipped and its shader flag is cleared; the first visible frame renders a fresh reflection. Visible reflection resolution, lighting, geometry and cadence are unchanged.

Native inspection verified that both tile meshes fit inside the bounds. Across 361 parameter samples, 61 / 59 / 97 positions omit the reflection at aspect ratios 2.779 / 2.859 / 1.778 respectively; this is not a time-weighted savings measurement. A separate 61-frame actual camera render check observed exactly one mirror render at each visible position and none at the ten offscreen positions, including re-entry. Evidence: `output/shadow-checkers-unity/reflection-visibility-checks.json`. This targets the entrance; the previous seated-view count of 658 draws is not expected to decrease.

Unity build succeeds at 10,521,986 bytes; the full app is 98,786,749 bytes (94.21 MiB), within budget. Lint, TypeScript, app build and all four source/dist hashes pass. Generated scene/settings restored. Windows WebKit opening/overhead/reset passes (`material-webkit-1790325719664`); Chromium opening, capture, kinging and pause/resume pass (`material-chromium-1790325744891`). No push/deployment or additional screenshots. Physical-device performance and final visual acceptance remain open.

### Night window and continuous entrance (September 25)

Widened the window bay and moved the adjacent bookcases intact. Replaced the opaque baked pane with a dark dusk gradient and one combined mesh of smooth, tapered bare branches. The shader clips both layers to the opening, including oblique views. Walnut casing and the raised sill now cover the edges without exposing wall paneling inside the glass. No new texture or realtime light was added. Sources: `ArtSource/create_study.py`, `Assets/StudyWindow.cs`, `Assets/Resources/StudyWindow.shader`.

`ShadowBoardCinematics.cs` starts the existing continuous 12-second room sweep just beyond the right window pane at (4.55, 5.8, 14.5). Native sampling confirms the path crosses the opening at (4.515, 5.770, 14.148), clear of its mullions. Six early rendered frames contain visible room detail; this checks against blank entry frames, not subjective motion quality. Branch mesh: 1,344 vertices, 2,352 triangles; current shader messages empty. Evidence: `window-checks.json`, `window-entry-frames.json` and the reviewed `window-sill-final-native.png` under the existing output folders.

Unity build succeeds at 10,518,138 bytes; app 98,782,901 bytes (94.21 MiB), within the unchanged cap. Lint, TypeScript, production build and four source/dist hashes pass. WebKit opening/overhead/reset passes (`material-webkit-1790324860700`). Final Chromium landscape frame reviewed; profile `render-chromium-2-1790324918776` records 30.60 submissions/sec, 658 draws/frame, 33.4 ms p95, no intervals over 50 ms and 8.9 ms main-loop p95. Editor scene/settings restored and validation Play mode stopped. These desktop checks do not establish physical-phone performance. No push/deployment; photo-reference fidelity and device acceptance remain open.

### Mobile-native study texture format (September 25)

`TextureImport.cs` explicitly imports all ten study textures as ASTC 6x6 for WebGL, preserving their existing resolutions, mipmaps and anisotropy. `ShadowCheckersBuild.cs` now also reimports PNG atlases so book/fire format changes are applied consistently. No alternate data bundle or new runtime dependency is required. The imported texture audit (`output/shadow-checkers-unity/astc-textures.json`) records 6,925,520 bytes of theoretical compressed mip storage versus 61,865,976 bytes if those textures expand to RGBA32. This excludes render targets and other allocations and is not a physical-phone memory measurement.

Unity build: 10,474,272 bytes (+373,552); full app: 98,739,035 bytes (94.16 MiB), inside the unchanged cap. Lint, TypeScript, app build and all four source/dist hashes pass. Editor scene/settings restored and reimported. Reviewed the final Chromium landscape frame; texture detail and colors remain coherent. Chromium (`material-chromium-1790323442121`) and accelerated Windows WebKit (`material-webkit-1790323542807`) pass opening/overhead/reset, captures, kinging and pause/resume without page errors.

Both desktop browser probes lack ASTC/ETC2 support and expose DXT. Added actual texture capability/upload-format reporting to `scripts/shadow-checkers-render-profile.mjs`. Final profile `render-chromium-2-1790323635871` confirms the non-ASTC fallback renders through RGBA8/sRGB8-alpha texture storage; no compressed ASTC uploads were observed on this host. It reports 30.61 submissions/sec, 658 draws/frame, 33.4 ms p95, no intervals over 50 ms and 8.9 ms main-loop p95. Desktop cadence is not physical-phone performance proof. Phone verification must show ASTC capability and native compressed uploads, then test sustained play and background recovery. No push/deployment; full reference fidelity and physical-device acceptance remain unfinished.

References: [Unity WebGL compression targets](https://docs.unity.com/en-us/engine/6000.3/script-reference/unityeditor/webgltexturesubtarget), [Khronos ASTC extension](https://registry.khronos.org/webgl/extensions/WEBGL_compressed_texture_astc/). The preceding checkpoint's DXT follow-up is addressed by this import change; its real-device validation remains open.

### Lossless web delivery and compression-safe cache URLs (September 25)

`ShadowCheckersBuild.cs` now uses Brotli with Unity's decompression fallback and disables the optional Unity 6 splash, retaining the host's themed loading screen. No texture dimensions, meshes, lighting or audio were reduced. Unity build size falls from 11,721,131 to 10,100,720 bytes; final app payload is 98,365,483 bytes (93.81 MiB), leaving 1,634,517 bytes under the unchanged cap. Browser decoder overhead is included. Build compression took about 94 seconds on this host; physical-phone startup speed was not measured.

Found and fixed a cache hazard: Unity reused the framework/wasm filenames across gzip and Brotli because their decoded content was unchanged. Both the native publisher and `scripts/package-shadow-checkers-unity.mjs` now append SHA-256 of the encoded bytes to each asset URL, including the standalone generated index. `tests/shadowCheckersDelivery.node.test.mjs` verifies same-filename compression changes receive a new URL, unchanged assets retain their URLs, and repeat packaging is idempotent. The generated native manifest/index versions were checked against all four actual encoded hashes. `brotli-delivery-checks.json` confirms valid Brotli payloads and byte-identical decoded framework/wasm against `gzip-baseline.json`; the final build report contains no splash asset.

Lint, TypeScript, production build, the delivery regression and four source/dist hashes pass. Chromium (`material-chromium-1790322697602`) and accelerated Windows WebKit (`material-webkit-1790322945772`) pass entrance/overhead/reset, capture, kinging and pause/resume without page errors. Final Chromium delivery check (`material-chromium-1790323042344`) deliberately blocks unversioned URLs, verifies all four versioned requests and reaches the playable board. This models legacy-URL rejection; hosted CDN/PWA cache transition and physical phones remain unverified. Editor scene/settings restored/reimported; foreground preview refreshed. No push/deployment.

References: [Unity 6.3 deployment compression and fallback](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-deploying.html), [Unity Personal splash customization](https://unity.com/products/unity-personal). The current texture assets still use DXT; evaluate mobile-native texture delivery separately, with actual device capability evidence, before claiming mobile GPU-memory optimization.

### Furnished study armchair (September 25)

Added `StudyChair.cs`, instantiated by `MedievalStudy.cs`, to furnish the far side of the writing table. Turned walnut legs and arm supports, a continuous arched crest with carved bead, shaped leather seat/back, twelve recessed upholstery buttons and brass seat tacks are assembled once into three meshes using the existing materials/textures. The reverse and edges are closed for the entrance sweep. Owned meshes are destroyed with the chair; there is no per-frame chair update or new downloaded texture.

Native inspection corrected the first segmented crest to continuous curved molding. Final geometry: 6,021 vertices, 10,496 triangles, three renderers; floor contact Y -4.625, table clearance 1.248 and minimum camera clearance 4.694 across 361 samples of the actual tour spline. Shader messages empty. Evidence: `output/shadow-checkers-unity/chair-checks.json` and `study-chair-final-native.png`.

Unity build 11,721,131 bytes (+10,303); app 99,985,358 bytes (95.35 MiB), below the unchanged cap with only 14,642 bytes remaining. Lint, TypeScript, production build and four source/dist hashes pass. Generated Editor scene/settings restored/reimported. WebKit opening/overhead/reset passes (`material-webkit-1790322283875`). Final Chromium landscape frame reviewed; `render-chromium-2-1790322322205` reports 29.98 submissions/sec, 658 draws/frame, 33.4 ms p95, no intervals above 50 ms and 8.8 ms main-loop p95. These desktop results do not prove phone GPU/thermal performance. No push/deployment; reference fidelity and physical-device acceptance remain open.

### Shared photographed leather grain (September 25)

Added Rob Tuytel's CC0 Brown Leather roughness photograph from Poly Haven, credited in `ArtSource/THIRD_PARTY_ASSETS.md`. `StudySurface.shader` samples the mipmapped grain spatially so the rounded folios need no UV rebuild. It modulates surface color and polish while retaining their vertex-color variation and the library's existing gilded spine atlas. `MedievalStudy.cs` shares one texture across both book materials; `TextureImport.cs` caps the WebGL import at 256 px. No new mesh, material pass or dependency.

Native close-up reviewed (`leather-grain-native.png`); shader messages empty. Unity build 11,710,828 bytes, an increase of 26,113 bytes. App payload is 99,975,055 bytes (95.34 MiB), still below the unchanged 100,000,000-byte cap but with only 24,945 bytes remaining. Further assets require savings elsewhere. Lint, TypeScript, production build and all four source/dist player hashes pass. Generated Editor scene/settings restored and reimported.

Windows WebKit opening/overhead/reset passes with no page errors (`material-webkit-1790321709804`). Chromium landscape frame reviewed; `render-chromium-2-1790321746527` reports 29.98 submissions/sec, 630 draws/frame, 33.4 ms p95, one interval above 50 ms and 8.3 ms main-loop p95. This is desktop submission timing, not physical-phone GPU/thermal proof. No push/deployment; photo-reference fidelity and physical-device validation remain unfinished.

### Dimensioned, beveled marble base (September 25)

Resolved the stone-base streaks noted in the preceding checkpoint. The original unit cube was scaled 10.1 x 0.7 x 10.1, stretching its object-space marble pattern horizontally. `StoneBaseMesh.cs` now builds the actual dimensions into a small rounded-face mesh; `ShadowBoard.cs` uses unit transform scale and a uniform 0.25 stone cut. The 0.045 bevel catches grazing light while retaining the base footprint, top and table contact height.

Native checks: 96 vertices, 108 triangles, no reversed or degenerate triangles, unit normals, mesh/world size 10.1 x 0.7 x 10.1, scale 1, bottom Y -0.955 and top Y -0.255. The existing collider uses the actual dimensions, and the mesh joins the board's existing destruction cleanup. Evidence: `output/shadow-checkers-unity/stone-plinth-checks.json`; native appearance reviewed in `stone-plinth-native.png`.

Final Chromium landscape frame reviewed. Profile `render-chromium-2-1790321049624`: 29.99 submissions/sec, 630 draws/frame, 33.4 ms p95, none over 50 ms and 8.6 ms main-loop p95. Desktop submission timing does not establish physical-phone GPU performance.

Unity build: 11,684,715 bytes; app: 95.32 MiB within the unchanged limit. Lint, TypeScript, build and four source/dist hashes pass. Accelerated Windows WebKit opening/overhead/reset passes (`material-webkit-1790320978648`) with zero page errors. Generated Editor scene/settings restored/reimported. No push/deployment; broader photo-reference fidelity and physical-phone performance remain open.


### Walnut tabletop finish (September 25)

`StudySurface.shader` previously replaced the material polish with `1 - roughness * 0.7`, allowing narrow near-mirror highlights even though the intended wood finish was 0.52. Wood now varies around that finish using a 0.24 range, with grain normal strength reduced from 0.45 to 0.18. `MedievalStudy.cs` uses a more neutral (0.80, 0.75, 0.67) multiplier so the already-dark wood photograph retains its color rather than being heavily darkened/saturated a second time. Other study materials keep their existing paths. No textures, geometry or render passes were added.

Native table view reviewed in `walnut-finish-native.png`; current shader messages are empty. The pale streaks on the checkerboard's separate stone base remain a distinct issue; inspect scaled object-space texture mapping there rather than changing wood further to hide them.

Final Chromium landscape frame reviewed. Profile `render-chromium-2-1790320554790`: 29.99 submitted frames/sec, 626 draws/frame, 33.4 ms p95, none over 50 ms and 8.6 ms main-loop p95. These are desktop submission measurements, not phone GPU/thermal proof.

Unity build: 11,684,451 bytes; app: 95.32 MiB inside the unchanged limit. Lint, TypeScript, build and all four source/dist hashes pass. Accelerated Windows WebKit opening/overhead/reset passes (`material-webkit-1790320507242`) with zero page errors. Generated Editor scene/settings were restored and reimported. No push/deployment; physical-phone performance and final photo-reference fidelity remain open.


### Continuous marble mapping and polish (September 25)

The renderer is already linear. Piece caps/sides were using separate UV islands, which broke the surface pattern across their profiles. `Marble.shader` now has an opt-in object-space triplanar path, blending three projections of the existing marble map across normals. Stable per-piece cut offsets remain in the existing instancing property block and move with the piece. `ShadowBoard.cs` enables this on the stone pieces/surround while retaining the board tiles' single-sample UV path. No texture or mesh was added.

Silver stone has a cooler, lighter base with softer slate veins, and mineral polish variation is reduced to 0.025 for both factions. The native close-up was reviewed in `continuous-stone-closeup.png`. An initial custom-varying implementation exceeded the shader-model-3 interpolator budget; the final implementation derives local coordinates from existing inputs and compiles without raising the target or retaining extra interpolators.

Final Chromium landscape render reviewed. Profile `render-chromium-2-1790320070513`: 29.98 submissions/sec, 626 draws/frame, 33.4 ms p95, no sampled interval over 50 ms and 8.8 ms main-loop p95. This is desktop submission timing; it does not prove mobile GPU cost.

Unity build: 11,685,136 bytes; app: 95.32 MiB inside the unchanged limit. Lint, TypeScript, build and four source/dist player hashes pass. Current shader messages are empty. Accelerated Windows WebKit opening/overhead/reset passes (`material-webkit-1790320029307`). Generated Editor scene/settings restored and reimported. No push/deployment; physical-phone shader cost and final reference-photo visual acceptance remain open.


### Seated playing view and raised-piece selection (September 25)

Lowered the final perspective camera from Y 7.4 to 5.4 while retaining the landscape distance, field of view, reset/orbit behavior and safe overhead height. The room reveal uses this final camera position automatically, so its continuous rail settles into the lower view. The native 16:9 composition was reviewed in `seated-camera-native.png`; all playable centers remain visible in the tested landscape aspect ratios.

The change exposed a pre-existing input defect: selection intersected only the board plane. A tap on the visible top of a far-side piece at row 0, column 1 produced row -1. `ShadowBoard.cs` now caches each combined token mesh's local bounds, resolves the nearest token under the ray first, and falls back to the board plane for empty squares. This adds work only on taps and does not introduce physics colliders. Piece positions remain canonical for both player orientations; refreshed crown meshes update their picking bounds.

`Assets/Editor/PointerDiagnostics.cs` exercises the production picker and actual mesh bounds. All 960 checks pass: 192 normal/king surface hits and 768 empty-square hits, covering both player orientations, three landscape aspects and reset/left/right/overhead views. Evidence: `output/shadow-checkers-unity/pointer-checks.json`. This establishes geometry and coordinate behavior, not physical-thumb usability.

Chromium `material-chromium-1790319324571` and accelerated Windows WebKit `material-webkit-1790319423884` pass opening/overhead/reset, touch-driven double capture, kinging and pause/resume with zero page errors.

Final landscape browser frame reviewed. Profile `render-chromium-2-1790319503681`: 29.99 submissions/sec, 626 draws/frame, 33.4 ms p95, none over 50 ms; main-loop p95 8.8 ms. This is desktop submission timing, not physical-phone performance.

Unity build: 11,679,671 bytes; app: 95.31 MiB inside the unchanged limit. Lint, TypeScript, build and all four source/dist player hashes pass. Generated Editor scene/settings were restored and reimported. Local only; no push/deployment. Physical-phone validation and final reference fidelity remain open.


### Static reflections and moonlit glass (September 25)

The one-time room reflection previously captured the starting checker pieces. All ordinary and crowned token renderers now use layer 9, excluded only from the static room probe. The live planar board reflection continues to include that layer, so moving/captured/promoted pieces remain visible in current board reflections without retaining their starting positions in the room cubemap. Probe resolution increases from 64 to 128 for clearer room features, still captured once rather than every frame. Native inspection confirmed all 48 initial piece renderers are excluded from the static probe and included in the live planar camera (`output/shadow-checkers-unity/reflection-checks.json`).

`StudyWindow.cs` and `Resources/StudyWindow.shader` add one luminous glass surface behind the existing imported mullions: a restrained dusk gradient, small optical variation and darkened edges. The runtime X coordinate accounts for the Blender-to-FBX horizontal mirror. No new texture or light is added; the material is destroyed with the scene. The window contributes to both static and live reflections. Native alignment and the reflected highlight were reviewed.

Chromium `material-chromium-1790318688810` and accelerated Windows WebKit `material-webkit-1790318774825` both pass opening/overhead/reset, double capture and kinging with zero page errors.

Final Chromium profile `render-chromium-2-1790318846602`: 29.99 submitted frames/sec, 617 draws/frame, 33.5 ms p95 and no interval over 50 ms; main-loop p95 8.5 ms. Final browser window/frame alignment reviewed. This remains desktop submission evidence.

Unity player: 11,677,224 bytes; app: 95.31 MiB within the unchanged limit. Lint, TypeScript, build and all four source/dist player hashes pass. Generated Editor scene/settings were restored and reimported. No push/deployment. Real-phone GPU/memory/thermal validation and final reference-photo visual acceptance remain open.


### Study lighting and highlight control (September 25)

Added `StudyColorGrade.cs` and `Resources/StudyToneMap.shader`: one full-screen highlight rolloff using the attributed CC0 Narkowicz fit, with a low-light blend to preserve baked shelf detail. HDR is enabled only when supported; high-contrast mode bypasses grading. Native HDR, forced LDR and bypass rendering succeeded. Softer warm key, vertex-lit window fill, matched candle/flicker intensity 1.45 and baked exposure 0.95 add no textures or lights. HDR does introduce an intermediate buffer, so physical-phone memory/GPU/thermal validation remains necessary.

Native and rebuilt browser views were reviewed. Unity player: 11,675,612 bytes; app: 95.31 MiB. Lint, TypeScript, build, docs and all four source/dist hashes pass. Chromium profile `render-chromium-2-1790318171435`: 29.99 submitted frames/sec, 615 draws/frame, 33.4 ms p95, no sample over 50 ms, 1830 x 640; main-loop p95 8.3 ms. These are desktop submissions, not phone GPU completion measurements. Chromium `material-chromium-1790318242078` and accelerated Windows WebKit `material-webkit-1790318203674` pass opening/overhead/reset with zero page errors.

Generated Editor scene/settings were restored and reimported. Foreground preview: `?revision=study-lighting-20260925`. No push or deployment; reference-photo visual acceptance and physical-device validation remain open.


### Rounded tabletop folios (September 25)

`ArtSource/study_folios.py` replaces the rectangular tabletop-book placeholders with rounded leather backs, integrated raised sewing supports, softly worn cover corners, and ten uneven page gatherings per book. The exposed fore-edge is opposite the spine. Existing unequal dimensions/offsets remain, with closer stacking contact and subtle edge-color wear. `study_details.py` adds gilt spine titles conformed to the curved leather, using the existing typeface/material. No new runtime material or texture is required. The final native close-up was reviewed in `output/playwright/shadow-checkers-unity/folios-rounded-native.png`.

The shared paper/leather meshes decrease from 12,794 to 8,724 vertices. Including added spine lettering in the metal mesh, the affected groups decrease from 69,816 to 67,654 vertices. The editable Blender study, runtime FBXs and baked atlases were rebuilt. A Windows file lock on `StudyMetals.fbx` interrupted one export; the generator now stages complete FBX/atlas files outside Assets and atomically replaces the destination. Unchanged source texture copies are skipped, and the documented Blender command uses `--python-exit-code 1` so script failures cannot masquerade as a successful process exit.

Final Unity build: 11,673,324 bytes; app: 95.31 MiB within the unchanged budget. Lint, TypeScript, build and all four source/dist player hashes pass. The original Editor scene/settings were restored and reimported. No push or deployment; final reference-level material/lighting acceptance and physical-device validation remain open.

Chromium and accelerated Windows WebKit passed the rebuilt opening/overhead/reset checks without page errors (`material-chromium-1790317143954`, `material-webkit-1790317227291`). The foreground preview is on `?revision=rounded-folios-20260925`. These art-only checks do not replace the existing game-rule/ending checks or establish physical-phone proof.

### Banked hearth fire and mobile packaging (September 25)

The prior 5.8-unit central flame filled almost the entire fireplace and overlapping additive layers obscured its fuel. The fire now has staggered 3.6/2.5/2.15-unit tongues with premultiplied core attenuation. `StudyHearth.cs` adds four irregular charred logs and 42 ember fragments as one static mesh (2,110 vertices, one material). `StudyCharcoal.shader` supplies irregular cracks, reused oak grain and a slow glow driven by the existing pause-aware study clock. Its matte single-pass lighting avoids unnecessary reflective material variants and extra lights. Candle animation remains unchanged.

Native checks confirmed pause and reduced motion freeze the shared flame/ember clock, and shader compilation passed (`output/shadow-checkers-unity/hearth-checks.json`). The final Unity build is 11,719,417 bytes. Packaging initially hit Windows error 1224 while truncating a manifest mapped by the preview server; `ShadowCheckersBuild.cs` now writes metadata via atomic replacement and validates the successful WebGL report's destination. The already-completed player was finalized without recompilation, and the subsequent optimized build completed normally.

The authored 23-second mono fire loop is preserved in `ArtSource/Audio/fireplace-loop-master.mp3`; reproducible VBR delivery encoding saves 29,052 bytes without changing duration or measured mean/peak level (-49.0/-19.9 dB). The original music is unchanged. Shader optimization plus this encoding keeps the app inside the unchanged 100,000,000-byte limit at 95.35 MiB. Lint, TypeScript, audio lifecycle checks and build pass, and all four source/dist Unity payload hashes match.

Final Chromium measured 29.97 submitted frames/second, 653 draw calls/frame, 33.4 ms p95 and no sampled interval over 50 ms at 1830 x 640, with the separate preview renderer disabled for the sample (`render-chromium-2-1790316148583`). The landscape render was reviewed. These are desktop submission timings, not physical-device GPU, thermal or PWA proof. No push or deployment; final reference-level room fidelity remains open.

Accelerated Windows WebKit passed opening/overhead/reset, double capture, kinging and pause/resume without page errors (`material-webkit-1790316185353`). The final native hearth close-up was reviewed in `output/playwright/shadow-checkers-unity/hearth-native.png`; the foreground browser now uses `?revision=banked-hearth-20260925`. Generated build-scene/settings changes were restored and reimported.

### Client and server complete-game parity (September 25)

Seeded complete-game comparison found that the client switched `turn` to the defeated opponent after a winning move while the SQL engine kept the winner as the terminal turn. `engine/checkers.ts` now matches SQL for both capture and immobilization wins. Regression tests cover both players and reject moves after completion.

`scripts/shadow-checkers-rules-parity.mjs` compares the production TypeScript engine with verbatim PostgreSQL functions, applying later migration overrides through `scripts/shadow-checkers-sql-overrides.mjs`. It normalizes only timestamps and piece-storage order. All 24 seeded games completed: 1,913 moves, 460 captures, 52 multi-jumps, 86 promotions, 669 king moves and 765 rejected illegal requests. Evidence: `output/shadow-checkers/rules-parity-1790314779434/report.json`. Read-only deployed checks confirmed the initial-board and move-function body hashes match those used locally. This establishes the sampled rules agreement, not hosted match transport or concurrent transaction behavior.

The continuation fixture now also loads the later stats/crown and SQL lint overrides. Its minimal users fixture includes `admin_role`, and it explicitly verifies that an admin retains statistics while the crown rotates to the highest-ranked eligible non-admin. All 31 assertions pass on PostgreSQL 17.5 (`output/shadow-checkers/sql-continuation-1790314970108/report.json`). No production migration, push or deployment was performed.

Lint, TypeScript, 37 targeted tests, docs integrity and build passed (95.36 MiB). The real Unity ending fixture passed all three scenarios in Chromium and accelerated Windows WebKit after the terminal-turn correction (`ending-chromium-1790315040966`, `ending-webkit-1790315105590`). No extra screenshots or native rebuild were needed. These are desktop browser runs, not physical-phone proof.

### Isolated backend continuation validation (September 25)

Read-only inspection of the deployed Postgres 17.6 definitions confirmed that rematch/next-challenger RPCs omit `board_skin`, and the duplicate-character fallback can select `veil-rogue` when the winner already uses it. Isolated execution also reproduced duplicate rematches on retry. The local migration `20260925053123_shadow_checkers_continuation_integrity.sql` preserves cosmetics, records one continuation under the completed-match row lock, carries remaining queued challengers to the new session, and resolves character collisions. Historical null participants/winners fail closed. The optional `continuation_match_id` field is reflected in the manual match type; existing deployed row shapes remain compatible.

`scripts/shadow-checkers-sql-qa.mjs` loads the shared-game and Checkers migrations in an in-memory PostgreSQL runtime. The initial run passed 29 assertions: winning capture/promotion, winner/loser totals and crown settlement, replay rejection, preserved cosmetics/seats/24-piece restart, repeated rematch requests, two successive queued handoffs, access guards and blocked direct board/stat writes. Baseline failed duplicate-rematch and character-collision scenarios (`output/shadow-checkers/sql-baseline-1790314341695/report.json`); the first Postgres 17.5 run passed (`output/shadow-checkers/sql-continuation-1790314516645/report.json`). The complete-game checkpoint above supersedes that fixture with later function overrides and 31 assertions. Reports contain loaded migration hashes. A PGlite 0.5.8/Postgres 18 run also passed; the retained pinned runtime uses Postgres 17 to match the deployed major version.

Reproduce without live credentials:

```powershell
npm install --prefix output/checkers-sql-runtime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.3.16
node scripts/shadow-checkers-sql-qa.mjs
```

This is SQL/PLpgSQL proof with minimal users/auth-identity fixtures, not GoTrue, REST, Realtime, push or concurrent-transaction proof. Docker startup failed on its existing `dockerInference` socket, so no full local Supabase stack/advisors ran. The nine processes started by that failed attempt were verified and removed; none remained. PGlite is confined to ignored `output/`, with no app dependency or lockfile changes. Lint, TypeScript and build passed; app remains 95.36 MiB. Production was queried read-only and the continuation column remains absent: this migration has **not** been applied remotely. No push/deployment.

### Winning-move presentation before results (September 25)

The match screen previously displayed results immediately on receipt of a winning board, covering its final capture or crown animation. Unity now emits a revision-tagged `presented` event after camera travel, piece movement, victim flights and impact ripples have finished. Paused presentation never acknowledges completion. The host accepts only its own frame's current revision and shows results for that presented board; `rendered`, generic cinematic-ready and stale events cannot release the result. Accessible-board selection or player failure releases results without an arbitrary animation timer.

`scripts/shadow-checkers-ending-qa.mjs` uses the production screen, actual WebGL player and real engine with isolated auth/data transport. It wins a double-capture fixture and a capture-to-king fixture, pauses mid-animation, checks that results remain absent, resumes and verifies completion precedes Victory. It also covers reduced-motion completion, result dismissal and rematch dispatch. It does not complete a ranked server match. Native code, host callback and result gating live in `ShadowBoard.cs`, `ShadowBoardCinematics.cs`, `ShadowCheckersUnityBoard.tsx` and `ShadowCheckersScreen.tsx`.

Chromium and accelerated Windows WebKit passed: `ending-chromium-1790313850126` and `ending-webkit-1790313914230`. Eighteen screen/host tests cover current-frame/current-revision acknowledgement, result ordering and fallback. Lint, TypeScript and app build passed; native player is 11,696,620 bytes, packaged app 95.36 MiB within the unchanged budget, and source/dist player hashes match. Local only; physical-device, ranked continuation and final reference-fidelity acceptance remain open.

### Landscape match controls (September 25)

The real screen's board picker measured 383px tall and its character picker 440px tall in a 667 x 320 viewport. The confirmation button was unreachable. Short landscape screens now use compact side-by-side board choices, a single row of all eight character portraits, 44px picker close controls and a horizontal result card. Dialogs respect safe-area padding and have a bounded scrolling fallback. Character selection exposes its pressed state; the result surface uses valid opaque background styling and retains the complete artwork.

`scripts/shadow-checkers-layout-qa.mjs` renders the production screen and Comfort provider while intercepting auth/data hooks and the Unity frame locally. Chromium and Windows WebKit checks cover 667 x 320 at 100% and 130% text, 844 x 390 at 130%, and 915 x 412 at 100%: bounds, touch targets, all eight characters, create dispatch, all result totals, dismissal and rematch dispatch. This does not create a server match or establish physical-phone, ranked-continuation, Unity performance or installed-PWA proof. The native player is unchanged by this layout checkpoint. No push or deployment.

### Rendering work reduction, September 25

`scripts/shadow-checkers-render-profile.mjs` now measures actual WebGL draw submissions separately from browser animation callbacks. In the desktop WebKit fixture at 1830 x 640 internal resolution, the prior player submitted 970 draw calls per frame at about 9.57 rendered frames/second. A 1.5 DPR trial (1373 x 480) yielded only 9.95 frames/second, so the production resolution cap remains 2.

The stationary board now combines into two meshes, one per square color, retaining all 64 beveled tiles and baking their original texture cuts into the UVs. This includes the FBX root's authored orientation and unit conversion. Tile source readability is enabled only for the combine operation. A serialized instanced marble material keeps its shader variants in WebGL; per-piece texture cuts use an instanced property instead of a non-instanced texture transform, following [Unity's per-instance property contract](https://docs.unity.com/en-us/engine/6000.0/manual/analysis/graphics-performance-profiling/birp/gpu-instancing-shader/per-instance-properties).

The final WebKit diagnostic measured 654 draw calls/frame (32.6% fewer) at unchanged resolution, with about 9.87 submissions/second. The image was reviewed with its stone detail, lighting, shadows and reflections retained. This is a measured reduction in rendering work, not a demonstrated WebKit frame-rate improvement or physical-phone acceptance. Baseline Chromium delivered about 29.96 submissions/second; browser callback frequency alone was higher and must not be reported as Unity frame rate.

Evidence: `render-webkit-2-1790308935809`, `render-webkit-1.5-1790308967886`, `render-chromium-2-1790309034173` and `render-webkit-2-1790309810227` under `output/playwright/shadow-checkers-unity/`. Final Chromium verification (`render-chromium-2-1790310133276`) measured 654 calls/frame and 29.997 submissions/second, 33.4 ms p95 and no sampled interval above 50 ms. Native geometry validation confirmed both combined meshes have 3,840 vertices, one submesh, center (0, 0.11, 0), and extents approximately (3.99, 0.06, 3.99). Final WebGL build is 11,653,520 bytes; app build 95.31 MiB. Lint, TypeScript, docs integrity, player hashes and final Chromium/WebKit opening, overhead, pause/capture and kinging checks pass (`material-chromium-1790309861017`, `material-webkit-1790309969419`). Full goal completion still requires physical-device proof, remaining feature-parity checks and reference-level visual polish. Local only; no push or deployment.

### Continuous entrance and placement corrections, September 24

The entrance now follows one distance-sampled curved rail from the window, around the study and into the playing view over twelve seconds. Only the overall start and finish ease; intermediate positions do not stop. The look target follows a continuous curve too. The overhead lens stays below the ceiling, and board coordinates use a depth-tested font shader with font-atlas refresh handling.

Moved the wall map and its complete frame clear of the window and corrected its orientation. Both tabletop maps clear the board footprint. The board, candle feet, goblet and ink pot now meet the tabletop. Brass casts contact shadows. Folios vary in size, thickness and angle as complete assemblies; shelf books vary in height, width, depth and lean. Added armillary graduations/numerals and glazed ink-pot details. Distant book bevels use fewer segments to offset the new detail.

Presentation pause now freezes capture delays, movement, capture flights, ripples and kinging, with pointer guards in both iframe and host. The final capture must finish before input unlocks. The editor-only `PresentationDiagnostics` probe passed all 17 live-transform checks, including pause/resume during double capture and crowning. A rendered font test found 3,218 visible glyph pixels without a blocker and zero through its opaque blocker.

Final WebGL build is 11,630,668 bytes; the app passes its unchanged budget at 95.29 MiB. Lint, TypeScript, 21 targeted tests, audio lifecycle, docs integrity and source/dist hashes passed. Chromium and WebKit landscape opening/overhead, paused double capture and paused kinging passed with no page errors (`material-chromium-1790308376214`, `material-webkit-1790308457332`). The 12.119-second entrance and quiet original music playback/mute passed in `tour-audio-1790308597884`; its recording was sampled to review framing. Windows WebKit cadence remains uneven (74 ms median, 92 ms p95); this is not physical-iPhone performance proof. Physical-device acceptance remains open. Local preview only; no push or deployment.

### Foreground study detail, September 24

Close surfaces now use six shared model/material groups rather than sharing the distant room's lighting texture: wood, paper, leather, wax, maps and wine. Folios have raised ribs, gilt tooling and layered page edges; candleholders and the goblet have worked brass detail; wax has pooled drips; tabletop maps have curled edges and the full source engraving. Library bindings retain their tooling atlas. Wood uses existing color, normal and roughness photographs. Baked vertex contact shading and a shared surface shader keep material counts bounded; wax warmth is a small shading approximation, not physical volume scattering.

Native close-up review caught and corrected vertex color-space washout, coarse metal grain and wax protrusions. The final generated scene removes 42,048 unnecessary shelf-band bevel faces while retaining raised strips. Web maps/books stay 2K, oak normals 512px, and the remaining furnishings light atlas 1K. The first build exceeded the existing app size gate; optimization brought the final player to 11,578,012 bytes and the app to 95.24 MiB without raising that gate.

The original music performance remains intact in a 128 kb/s stereo delivery file; the exact previous file is preserved at `ArtSource/Audio/heart-of-courage-master.mp3` (Git blob `51c438d8f7a6ceb5330a5b3e8385894b9d25d02b`). Its two-minute duration, looping playback, quiet 0.11 gain and Play/Mute were verified in Chromium, alongside the 9.12-second entrance pan. Source encoding is reproducible through `prepare_study_contacts.ps1`.

Lint, application TypeScript, native shader/WebGL build and app build passed. Final source/dist Unity payloads and music match by SHA-256. Final Chromium and WebKit phone fixtures passed opening, double capture and kinging with no page errors; the WebKit landscape render was reviewed. Evidence directories: `material-chromium-1790306016932`, `material-webkit-1790305877481`, `tour-audio-1790306096757`, and `foreground-native` under `output/playwright/shadow-checkers-unity/`. These checks establish local function and a detail improvement, not final photographic fidelity, physical-phone audio/GPU/thermal performance or installed-PWA acceptance. No push or deployment.

### Phone-only landscape contract

The user explicitly requires phone-only, landscape-only play matching Shadow Runner. Request a landscape orientation lock on game load; when a browser denies programmatic locking (including iPhone Safari), block portrait play behind a rotate gate. Share Runner's existing viewport/orientation settling logic. Landscape gets a compact turn/header bar, full-width Unity study and a toggleable chat side panel. Respect all four phone safe areas. Do not claim a web page can physically rotate an iPhone.

Background detail is being rebuilt as original 3D furnishings with offline Cycles lighting baked into shared texture atlases. Live board reflections and piece shadows remain dynamic. Combined piece meshes reduce draw calls. The 1024/512 web texture tier reduced the first complete Unity runtime from 17.2 MB to 7.7 MB; app download budget passed at 91.94 MiB. Recheck after adding the new study.

### Cinematic contract

The user requested an animated room reveal and zoom to the board on game load, animated movement throughout, and distinct capture and kinging events. The latest September 24 direction replaces the segmented lateral tour with a skippable, continuous twelve-second swoop from the window, around the study and into the table. Source retains 0.46-second grounded slides, 0.58-second arcing capture hops with victim removal timed to the jump, a landing ripple, and a separate solid upper marble tier descending onto a newly crowned king. Shared reduced-motion preferences bypass camera travel and movement effects. Pause the presentation while the portrait gate or background tab hides play. Input is blocked until presentation and captures finish; authoritative state remains owned by the host/server.

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
| Public tables | Create, join, continue, watch; both board skins and eight characters | Authenticated create/join passed; screen tests cover both skins, all eight choices, occupied-character blocking and exact spectate routing |
| Match play | Real 3D meshes, touch selection, mandatory capture, multi-jump, kings, hints, previous move | Both players' touch moves and capture/king fixtures passed |
| Social | Existing temporary chat, queue, rematch and next challenger | Two-account chat and local screen dispatch passed; isolated Postgres continuation/cosmetics/retry/FIFO checks passed with a prepared local migration; hosted continuation and concurrent transactions remain unverified |
| Results | Resign, cancel, admin removal, statistics, Hall of Fame and crown | Screen fixtures verify results/dismissal; isolated Postgres winning capture/promotion, winner/loser totals and crown settlement pass; no ranked completion against live statistics; other result controls retain prior evidence only |
| App integration | Existing auth, exact-match routes, unread counts and turn notifications | Auth and exact-match routes passed; notification tests passed |
| Comfort | Shared reduced-motion policy; keyboard/screen-reader board controls; phone safe areas | Component/orientation tests and landscape browser checks passed; physical phones pending |
| Reliability | Load progress/retry, dispose WebGL on exit, no double move submission, stale event rejection | Bridge/component and audio lifecycle tests passed |

## Architecture

`native/shadow-checkers-unity` contains original editable Blender assets and Unity 6000.3.24f1 source. Unity owns the scene, camera, rendering and raycast input. ShadowChat owns authenticated data access, realtime subscriptions, legal moves and the existing social screens. A same-origin iframe isolates the Web runtime and releases it when leaving a match. The versioned bridge accepts only its own frame, origin, revision and current legal choices. No credentials are sent to Unity.

The original board remains available as explicit accessible controls and as a recovery option if WebGL cannot load. Runtime files load only upon entering a match. The prepared local migration `20260925053123_shadow_checkers_continuation_integrity.sql` addresses continuation retry/cosmetic/queue integrity; it has not been applied to production and still requires hosted validation.

## Evidence

### Rounded library bindings and shelf composition, September 25

The original tooling atlas now wraps rounded spine geometry with raised sewing supports instead of flat faces and separate brass strips. Six small horizontal stacks interrupt the upright rows; complete volumes keep their covers, pages and artwork together. Upright books account for lean when seating on the shelf surface, and the last volume in each row is constrained to clear the bookcase pillar. Spine vertex colors now include baked ambient occlusion; low model compression preserves the shallow rib profiles.

Source: `ArtSource/create_study.py`, `ArtSource/study_details.py` and `Assets/Editor/TextureImport.cs`. The editable study and runtime FBXs/light atlases were rebuilt. The library has 171 volumes, including 18 stacked horizontally. The affected architecture/binding/metal meshes total 169,259 vertices versus 170,821 previously, with one submesh per group. Close-up reviewed: `output/playwright/shadow-checkers-unity/library-rounded-native.png`. This is native Editor visual evidence, not a physical-phone capture or final photo-reference acceptance.

Unity Web build succeeded at 11,695,252 bytes; packaged app is 95.35 MiB within the unchanged budget. All four player payloads match source/dist SHA-256. Chromium and accelerated Windows WebKit passed opening/overhead/reset, double capture, kinging and pause/resume without page errors (`material-chromium-1790312673072`, `material-webkit-1790312612419`). Lint, application TypeScript and scoped source diff checks passed. The foreground preview is on `?revision=rounded-library-20260925`. No push or deployment; physical-device and remaining visual-fidelity acceptance remain open.

The rebuilt library measured 30.83 submitted frames/second in accelerated Windows WebKit, 32 ms median / 34 ms p95, zero intervals above 50 ms and unchanged 654 draws/frame (`render-webkit-2-1790312858695`). An earlier sample with the separate foreground Unity preview still rendering measured 21.45 (`render-webkit-2-1790312761038`). For the isolated comparison, the foreground fixture was temporarily switched to its accessible board to release that additional renderer, then restored to 3D. Record active-renderer conditions when comparing desktop timings; neither run is physical-phone proof.

### Windows WebKit compositor diagnosis, September 25

The earlier approximately 10 FPS measurement is dominated by the desktop test environment's compositor configuration. Playwright 1.61.1 adds `--disable-accelerated-compositing` to native Windows WebKit (`node_modules/playwright-core/lib/coreBundle.js`, WebKit `defaultArgs`). The profiling script now offers an explicit `--accelerated` comparison that removes only that flag. Production Unity source, target rate, materials, resolution and payloads are unchanged.

Controlled probes at DPR 2 / 1830 x 640:

- Default Windows WebKit: 9.95 submitted frames/second; measured Unity loop median 9 ms, p95 12 ms (`render-webkit-2-1790311015300`). Suppressing draw submissions still yielded 9.82 attempted frames/second (`render-webkit-2-skip-draws-1790310921671`); a canvas tap also did not improve cadence (`render-webkit-2-1790311135624`).
- Accelerated compositing: 30.97 submitted frames/second, 32 ms median interval, 34 ms p95, zero intervals above 50 ms, unchanged 654 draw calls/frame (`render-webkit-2-1790311410123`). An independent visual run reproduced 30.98, with the same scene correctly rendered (`render-webkit-2-1790311476233/landscape.png`).
- Accelerated WebKit passed opening/overhead/reset, double capture, kinging and pause/resume with no page errors (`material-webkit-1790311513960`). Its manifest matches the previous finished player.

Reproduce with `node scripts/shadow-checkers-render-profile.mjs --webkit` and `node scripts/shadow-checkers-render-profile.mjs --webkit --accelerated`. Optional `--skip-draws` suppresses rendering and is diagnostic only; `--capture` saves visual evidence for rendered runs. The script records platform, compositor override, empty-page/parent rAF cadence, draw intervals and main-loop duration. It does not silently change default browser configuration.

This corrects the interpretation of the Windows slowdown; it does not prove physical-phone frame rate, GPU completion timing, thermal behavior, installed-PWA audio or final visual acceptance. The reported "Apple GPU" string comes from the Windows port, not actual iPhone hardware. Lint, TypeScript and app build (95.31 MiB) passed. No push or deployment.

### Original feature screen checks, September 25

`tests/ShadowCheckersScreen.test.tsx` now has 12 passing tests, including eight new cases around the real production screen and Unity host component. They exercise classic/cinematic creation with a selected character, availability of all eight character choices, automatic replacement of an occupied join character, exact-table queue/spectate routing, and a spectator's disabled Unity snapshot plus rejected square events. Completed-match fixtures verify victory/defeat, move/capture/crown totals, dismissal, winner-with-queue next-challenger selection and rematch selection otherwise.

The hook is mocked: this proves interface dispatch and input restrictions, not server authorization, ranked settlement, queue persistence or realtime continuation. No ranked match or global statistics were modified. Evidence: `output/checkers-parity-tests.log`. Existing rendered mobile opening/overhead/capture/king checks remain the player evidence; this test-only pass does not establish physical-phone performance or photo-reference acceptance.

### Softer contact audio and panoramic entrance, September 24

The user rejected the placement sounds as clunky and requested a room pan rather than the original straight zoom. Contact recordings now blend CC0 light wood and glass recordings at their natural pitch, with softened attacks, filtered high frequencies and short tails. The encoding recipe and sources are retained in ArtSource. The old placement sample peaked at 0 dBFS; the replacement MP3s peak around -6.1 dBFS before their restrained runtime gains. Slide occurrence/gain and king pitch emphasis are reduced. The original music recording remains unchanged at the existing 0.11 mix gain.

Source implementation is in `ShadowBoardCinematics.cs`, `study-audio.js` and `ArtSource/prepare_study_contacts.ps1`. Audio lifecycle verification passed (mute during fetch, single fire loop, varied contacts, pause and disposal). Actual Chromium playback emitted all four double-capture contacts and suspended on mute: `sounds-1790302999212`, including `soft-study-contacts.mp3` recorded from the browser mix. The standalone local preview now includes the existing production music controller and explicit Play/Mute Music controls for audition.

Final WebGL build succeeded (9,264,574 bytes). The first tour test caught startup delta time skipping a second of the camera path; capped per-frame advancement fixes that hitch. The final Chromium run measured 9.24 seconds, and library/hearth framing was reviewed from its recorded video. The exact unchanged original soundtrack decoded to 120.024 seconds, started looping with nonzero samples and a running audio context at gain 0.11, and responded to Play/Mute. Evidence: `tour-audio-1790303186301/summary.json` and `room-tour.webm`. The final iPhone/WebKit player also passed opening, captures and kinging with no page errors (`material-webkit-1790303336653`); Windows WebKit still cannot prove actual iPhone audio. Lint, application TypeScript, audio lifecycle and app build passed (95.05 MiB). Subjective sound acceptance, physical-phone playback and foreground prop fidelity remain open.

### Local material study and Editor licensing, September 24

`ArtSource/preview_marble_materials.py` builds a separate Cycles material study using the original WarToken/CrownToken meshes and existing CC0 marble/oak maps. Editable output and reviewed 1000 x 750 render are under `output/shadow-checkers-material-study/`. The scene is open in Blender and the Blender MCP connection returned its expected objects. It explores stone veining, polish variation, silver inlays and reflected light; silver veining and room fidelity remain unfinished. This offline art study is not integrated into the Unity player and is not mobile performance evidence.

The user restored the Personal license later on September 24. A fresh Unity 6000.3.24f1 launch resolved entitlements, connected through MCP and entered the Checkers scene in Play mode. Evidence: `output/checkers-license-recheck-20260924.log`. The earlier license block is resolved; physical-device evaluation remains outstanding.

### Unity marble integration, September 24

The live stone shader now remaps the existing photographic texture into separate silver/black body and vein colors, with subtle mineral-dependent polish. This avoids losing the silver veins through simple linear-space inversion. Each piece receives a stable texture offset derived from its ID, shared by its base and crown. Board squares retain gentler contrast for legibility. Textured materials skip procedural noise; non-reflective materials skip the planar texture lookup. Planar Fresnel uses the actual world surface normal, and the directional shadow bias is reduced to bring contact closer to the piece base.

Native compilation and final WebGL build passed, with no marble shader diagnostics after guarding the projection denominator in non-camera shader passes. Final runtime size is 9,263,860 bytes. Lint, application TypeScript, 19 engine/bridge/component tests, documentation verification and the app build passed; the 95.06 MiB deployment payload remains within the existing budget. All four Unity assets in `dist` match the source manifest's files by SHA-256.

The final player passed room reveal, real touch input, double capture and kinging fixtures in headed Android/Chromium (`material-chromium-1790302321970`) and iPhone/WebKit (`material-webkit-1790302250126`), under `output/playwright/shadow-checkers-unity/`. Both reported no page errors. The WebKit landscape render was reviewed. These local fixtures use the production board component and rules engine; they do not replace the separately recorded hosted multiplayer check or physical-phone performance/audio acceptance.

Reviewed native before/after renders are `output/shadow-checkers-material-study/unity-before-20260924.png` and `unity-marble-20260924.png`. This is a material improvement, not completion of the reference-level room, lighting or physical-phone performance requirements. No push or production deployment in this pass.

The next prop-detail pass must address the current two-atlas bake's limited foreground texel density. `create_study.py` folds wax, page blocks, tabletop wood and maps into the furnishings/architecture bakes; runtime metals currently use one plain material. Existing source maps include oak color/normal/roughness and a full Mercator map. Preserve the low-cost distant room while improving foreground texture allocation, physical surface response and modeled detail. Do not count this source audit as implemented prop polish.

### Hosted WebKit verification, September 24

The current production health manifest identifies `bf08a5b9aab185f545a9df2271c6f3706901be23`; the Unity player assets are unchanged from the September 13 release. Headed WebKit/iPhone 13 emulation passed real canvas touch moves for both players, authoritative persistence, recipient realtime turns, temporary match chat, portrait-to-landscape containment and camera controls. Exact test-session cleanup passed. Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1790296822651/summary.json`. No screenshots were taken. This closes the previously interrupted hosted WebKit gameplay check, not physical-device sound, sustained performance or installed-PWA acceptance.

The canonical multiplayer QA script now includes the tested asynchronous release-note dismissal, 750 ms foreground settling, bounded page waits and failure capture that tolerates a closed browser without masking the original error or skipping cleanup. Runtime assets and game behavior were not changed in this QA update.

### Production deployment and hosted verification, September 13

User-authorized manual Netlify production deploy `6aa71c3d008e57996148d41c` published main commit `0763bf94b80dee4f3daa1b74b345332d7a1dc7d9` at `https://shadochat.online`. The live health manifest matches, the Unity frame returns HTTP 200 with `SAMEORIGIN`, and the media function loads and returns the expected HTTP 405 for GET. The in-app release record was published with a required restart. GitHub account restrictions still block the normal connector/Actions path.

Hosted Chromium/Pixel 7 emulation passed real Unity touch moves from both players, authoritative persistence, recipient realtime updates, match chat, portrait-to-landscape layout and camera controls. Exact test-session cleanup passed. Evidence: `output/playwright/shadow-checkers-unity/multiplayer-1789337182569/summary.json`. The hosted harness needed to dismiss asynchronously arriving release notes and allow the resumed player 750 ms after foregrounding before tapping; earlier runs without those accommodations timed out and cleaned their sessions. No screenshots were taken. Physical-phone audio, frame rate, thermal behavior and installed-PWA proof remain outstanding, as does final reference-level visual polish.

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
