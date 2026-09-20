# September 20 reference-polish review

Compared the selected reference against actual runtime screenshots in
`output/playwright/shadow-circuit-polish/`, including the close character view,
original Lesson 1/3, rotation gate, settings, pause, and new thumb consoles.

- PCB/logo and thick rounded metal controls now extend to rotation, loading,
  submenus and dialogs. The HUD is a compact top console; the chamber and both
  thumb areas stay distinct on the tested landscape screens.
- Darker beveled wall/lock bodies and brighter floor tops restore the reference
  contrast. The real square-spiral exit, socket and 34 other terrain variants
  replace runtime placeholders. Every visible template uses the current kit.
- The actual runtime explorer appears in the opening flyover; eyes/glasses,
  sleeves and hair were refined. It remains a stylized approximation, not an
  accepted exact likeness. Source and in-game views are clearly distinguished.
- Larger solid movement arrows, raised green pressed feedback, whole-surface
  sliding, and a separate manual camera pad/zoom improve touch control. Camera
  motion never follows the character's facing direction automatically.
- Original compositions and campaign are included following the user's explicit
  permission. MIDI instrumentation is General MIDI, not a claim of identical
  historic device samples. Physical phone audio and performance remain open.

This is the next personal-testing milestone, not final campaign/art acceptance.

## Previous menu baseline review

# Shadow Circuit selected-image implementation review

Reviewed 2026-09-20 against `assets-source/shadow-circuit/branding/selected/reference.png`.

## Method and evidence

Compared the source and rendered desktop (1672 x 941), Android/Chromium and iPhone/WebKit (844 x 390) screenshots together. Evidence: `output/playwright/shadow-circuit-branding/`. Browser automation uses local backend stubs; this is not physical-device evidence.

## Matches and deliberate adaptations

- Preserved green PCB environment, gray puzzle diorama, green keyhole microchip logo, silver/green title and Play/Levels/Settings hierarchy.
- Replaced baked buttons with working controls. Thick silver borders, rounded edges, layered raised bases and pressed states implement the user's later request for blockier buttons.
- Kept compact secondary guide/records/codes/credits links and a host exit. Mobile primary controls are at least 48 px high; secondary touch targets were increased to 44 px.
- Launcher artwork uses the existing Games card layout and centered cover crop. Title, emblem and character survive the 358 x 132 mobile crop.
- Gameplay has a real PCB background, metallic keyhole doors and raised gray tiles. Loading uses a branded panel and indeterminate activity bar, with reduced-motion handling.
- WebP runtime images replace AVIF after Windows WebKit could not decode the AVIF exports.

## Remaining differences and acceptance limits

- Desktop logo is slightly smaller and lower than the selected composition to preserve responsive controls and the exit.
- The actual hero is a new static Blender model, with swept brown hair, open black glasses, green clothing and backpack. It is closer in silhouette and detail but is not an exact likeness of the generated reference. Its current face/hair sculpt and animations remain art work, not signed-off final assets.
- All nine monster roles have independent static models. Several terrain assets remain provisional; complete campaign fidelity and final animation/VFX are not accepted.
- Windows WebKit has neither AudioContext nor webkitAudioContext. Its visual/touch checks pass; real iPhone audio remains unverified.
- Landscape is requested on launcher interaction. Browsers that disallow orientation locking retain the rotation gate; physical iPhone/Android installed-PWA rotation, sound and thermal performance need user testing.

Verdict: suitable for an explicitly labeled initial testing milestone after release checks; not final visual or full-package acceptance.
