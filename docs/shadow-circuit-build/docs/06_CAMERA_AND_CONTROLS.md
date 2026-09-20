# 06 — Phone controls and camera

## Default play view
Landscape-first perspective camera, approximately 55° downward pitch, 45° vertical field of view, world-aligned heading. Tune distance to keep roughly 9×9 useful puzzle cells readable on compact landscape; do not show the entire 32×32 board as tiny squares. Track player with a small dead zone and gentle translation. No automatic orbit, camera bob or shake by default. Large maps remain navigable without manual camera wrestling.

## D-pad
Lower-left fixed cross, four independently accessible direction buttons. Target overall footprint 168–192 CSS px when height permits; compact profile 144–160 px only with minimum 48 px direction hit targets. Respect effective large-target Comfort policy. Position beyond safe-area insets plus a 12–16 px margin and out of OS gesture strips. Visible center/dead region and persistent direction highlight. A settings diagram previews size and position; offer a mirrored left-handed layout.

Touch down acknowledges immediately. A tap requests one legal step. Holding repeats at core movement opportunities, not a second independent timer. On release, clear direction and any future hold-derived intent; only an already committed step may finish. At most one buffered turn, bounded to one next movement opportunity; it must be explicit and canceled on pause. Fast double taps represent separate intents with sequence IDs; no default browser click duplicate causes another move.

D-pad cardinal policy: a dominant-axis sector with hysteresis. At a diagonal boundary, retain the previous held direction until the finger crosses the hysteresis threshold; a fresh exactly ambiguous touch stays neutral. Do not choose direction by whichever React event happened to win. Two simultaneous movement pointers: first active movement owner keeps control until released; secondary controls still work. Explicitly support non-primary touch pointers for camera/pause/confirm. There must never be a diagonal simulation move.

Use Pointer Events, per-pointer capture and intent state [S09]. Handle pointerup, pointercancel, lostpointercapture, blur, pagehide, document hidden, orientation change and component disposal. Dragging out of a defined cancel margin stops movement. Captured events do not imply `pointerleave` will fire; use coordinates. Only the game control region gets `touch-action: none`; do not disable browser zoom globally. Menu content still scrolls and zooms normally. Avoid duplicate touch+mouse handler stacks.

## Right-side controls
**Focus** opens a paused, controlled overview; camera quarter-turn buttons and reset are inside that view. **Pause** stays in the top safe HUD, not under the main thumb. Pushing/pickup/doors are automatic on movement; no arbitrary action button. There is no fake jump button that only animates, and no jump that bypasses puzzles. Confirm/resume buttons must require a fresh press; holding a D-pad through a dialog cannot auto-resume motion.

Camera quarter turns are applied only while paused/focusing; flush movement inputs and use explicit Resume. Movement mapping is screen-relative to the stable quarter-turn heading. Add four-heading golden tests for each D-pad arrow. The default world-aligned camera makes Up map to north; keep an orientation compass after rotation. Never change mapping halfway through a held press.

## Keyboard and optional gamepad
Arrow keys/WASD for movement; Escape pause/back; F focus; R opens restart confirmation, Enter confirms dialogs, U undo when permitted. Rebind only if existing app shortcuts conflict. Ignore gameplay shortcuts while editing text/password input. Prevent arrow-page-scroll only while focused gameplay is active. No document-wide hijacking of chat controls. Gamepad support is optional polish after required phone inputs pass; not a reason to delay core work.

## Orientation and safe area
Attempt native browser fullscreen/orientation lock only following the user's launch gesture; capability-detect, catch rejection, and continue [S10]. Never promise iPhone lock works. Use a responsive viewport and rotate prompt. Do not CSS-rotate the entire app or change the shared manifest to landscape. Browser/OS rotation lock may require manual device setting; provide a plain explanation and an Exit button rather than an infinite spinner.

Portrait during a run: pause immediately, show rotate/resume, preserve checkpoint. `100dvh`/measured visual viewport with safe-area handling; test browser bars expanding/collapsing and keyboard opening. Dynamic Island/notch cannot cover pause, inventory or status. Keep controls outside hazardous game-view regions and ensure fingers don't block the player during follow-camera behavior.

## Acceptance scenarios
30 rapid press/release cycles; held direction across frame stalls; drag across sectors; release outside window; two thumbs; lost capture; lock screen; pull notifications; browser background; rotate while held; keyboard appearing for codes; phone zoom 130%; mirror controls; 4-heading map; buttons with screen-reader names. Instrument button acknowledgement and next-eligible-tick movement separately; don't report a 20 ms button highlight as 20 ms end-to-end gameplay latency.
