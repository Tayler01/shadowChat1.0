# Accessibility & Comfort

## Purpose

ShadowChat 2.0 includes device-level Comfort Profiles so members can tune the
interface without leaving the premium obsidian-and-gold product language. The
system is designed for phone use first and applies before sign-in, before React
mounts, and before the first painted app frame.

This is a comfort system rather than a disability-only settings page. It can
reduce sensory load, improve readability and target size, simplify translucent
surfaces, and stop automatic media playback.

## Device-Local V1 Contract

Release A stores a versioned preference record on the current device. This is
intentional:

- preferences affect login, install, recovery, and offline screens before an
  authenticated profile is available;
- the bootstrap path must not wait for the network;
- a device can have different comfort needs from another device owned by the
  same member; and
- Candidate 5 therefore introduces no shared Supabase dependency or migration.

The storage parser is fail-safe. Missing, malformed, older, or unavailable
browser storage resolves to the current ShadowChat presentation plus live
device preferences. A storage event keeps multiple tabs on the same device in
sync.

## Profiles And Controls

The Settings > Accessibility & Comfort surface offers named starting profiles
and individual controls. The exact current presentation remains the default.

- **Follow device** uses operating-system motion, contrast, and transparency
  preferences while keeping standard text, controls, spacing, and muted media
  autoplay.
- **Calm** uses solid surfaces, no decorative motion, play-on-request media,
  quiet interface/Hype audio, and no optional haptics.
- **High visibility** combines stronger contrast, 115% text, larger touch
  targets, and solid surfaces.
- **Large & easy to tap** combines 115% text, spacious message layout, and
  48px shared controls.

Members can independently choose:

- motion: follow device, standard, reduced, or no decorative motion;
- transparency: follow device, glass, or solid;
- contrast: follow device, standard, or high;
- text scale: 100%, 115%, or 130%;
- control size: standard or large;
- message spacing: compact, comfortable, or spacious;
- automatic media playback: muted autoplay or play on request;
- interface and celebration sounds; and
- optional haptics on supported devices.

Changing a control applies immediately and is announced to assistive
technology. Reset returns the device to Follow device. The same reset remains
in the fixed Comfort header so an oversized profile can always be recovered.

## Runtime Architecture

`public/comfort-bootstrap.js` reads the cached record synchronously from the
document head and applies effective `data-comfort-*` attributes before the app
module loads. It is a self-hosted external script so it remains compatible with
the planned enforced Content Security Policy.

The React Comfort provider owns the same normalization and resolution contract,
listens to operating-system media-query changes, persists explicit choices, and
wraps the application in Framer Motion's global `MotionConfig` policy.
Components with manual timers, particles, gestures, canvas effects, or media
playback must also consume the runtime comfort policy; CSS alone cannot control
those paths.

CSS maps the document attributes to semantic variables for font scale, spacing,
minimum touch size, focus treatment, borders, shadows, and surface opacity.
Large controls target 48 px without enlarging their icons. Compact spacing must
never reduce the phone touch baseline. Reduced transparency removes fixed
background artwork and backdrop filters from text-bearing app surfaces. Global
focus-visible treatment and Windows forced-colors rules preserve navigation and
state visibility outside the normal theme renderer.

Reduced motion keeps short 80 ms state transitions while removing repeated
animation and smooth scrolling. No decorative motion collapses those effects to
an effectively immediate state change. Essential loading spinners remain
visible in both modes. Compact, comfortable, and spacious density values are
consumed by the real General Chat message rows and DM message stack.

The first integration set includes interface and Hype audio, Hype celebration
motion, Golden Egg vibration, ShadowPin feed autoplay, and ShadowPin Theater
motion/autoplay. The preserved game-audio preference fields are not yet a claim
that every existing game consumes the policy; games and canvas effects remain
explicit follow-up surfaces.

## Core Integration Rules

- Keep browser zoom enabled.
- Do not communicate state by color alone.
- Preserve loading and progress affordances when motion is reduced.
- Do not make automatic media playback a prerequisite for understanding a pin.
- Treat `forced-colors` as a supported rendering mode.
- Keep games and immersive canvases usable; their DOM-external effects need an
  explicit follow-up policy rather than a broad destructive CSS override.
- New motion, autoplay, haptic, or audio behavior must use the shared comfort
  policy instead of reading `matchMedia`, `localStorage`, or device APIs ad hoc.

## Verification Gate

Candidate 5 requires:

1. unit proof for normalization, presets, storage failure, live device changes,
   cross-tab sync, and document attributes;
2. component proof for accessible labels, pressed/selected states, reset, and
   immediate preview;
3. lint, TypeScript, production build and bundle-budget checks;
4. authenticated Android Chromium and iPhone WebKit checks at phone widths for
   Settings, Chat, DMs, Activity, and ShadowPin;
5. reload proof that the selected profile is present before the app module runs;
6. keyboard focus visibility and no page-level horizontal overflow at 130%
   text; and
7. a physical-device follow-up for VoiceOver, TalkBack, native safe areas,
   software-keyboard compression, and installed-PWA behavior.

Physical device validation remains required before claiming complete platform
accessibility or WCAG conformance. Automated checks provide regression evidence,
not a conformance certification.

## Local Verification Evidence - July 11, 2026

Candidate 5 is implemented and locally verified. The focused unit/component
contracts cover parsing, legacy audio migration, presets, storage failure,
live device changes, cross-tab synchronization, prepaint attributes, Settings
semantics, Hype, Golden Egg haptics, and ShadowPin motion/autoplay integration.
Lint, TypeScript, the production build, paused-feature verification, and bundle
budgets passed with the candidate.

The authenticated `qa:comfort` browser pass succeeded on all three profiles:

- compact 320x568 Chromium;
- Android Chromium using the Pixel 7 profile; and
- iPhone WebKit using the iPhone 13 profile.

The pass verified solid surfaces, high contrast, 48px shared buttons, visible
keyboard focus, 130% text without page-level horizontal overflow across
Settings, Chat, DMs, Activity, and ShadowPin, plus persistence through a full
reload via the prepaint bootstrap. It also proved that the last sensory control
can scroll above the fixed nav and that the fixed header reset recovers the
default profile at 320px. Evidence is under
`output/playwright/candidate5-comfort-final-gate/` and is intentionally not a
physical-device or installed-PWA certification.
