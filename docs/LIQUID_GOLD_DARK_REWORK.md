# Liquid Gold Dark Rework

## Goal

Rework ShadowChat into a premium dark-mode interface built around:

- obsidian and graphite base surfaces
- restrained liquid-gold accents
- rimmed, pressure-reactive CTA buttons
- smoked-glass layering for panels and overlays
- slower, more deliberate motion instead of bright neon or generic gradients

This is not a full "gold everywhere" theme. Gold is reserved for interaction priority, active state, and premium emphasis.

## Visual Direction

The target look is:

- dark by default
- high contrast without harsh white slabs
- metallic depth instead of flat cards
- liquid/rimmed buttons instead of generic Tailwind gradients
- warm highlight lighting against cool dark surfaces

The intended emotional tone is:

- private
- expensive
- tactile
- cinematic
- focused

The interface should feel closer to a luxury console or dark editorial product UI than a standard chat dashboard.

## Problems In The Current UI

Current implementation issues in this repo:

- theme tokens are built around bright accent gradients in [src/index.css](/C:/repos/chat2.0/src/index.css:1)
- color schemes in [src/hooks/useTheme.tsx](/C:/repos/chat2.0/src/hooks/useTheme.tsx:1) are hue swaps, not full material systems
- primary buttons in [src/components/ui/Button.tsx](/C:/repos/chat2.0/src/components/ui/Button.tsx:1) are generic gradient pills
- input surfaces in [src/components/ui/Input.tsx](/C:/repos/chat2.0/src/components/ui/Input.tsx:1) are light-mode biased
- most core screens rely on repeated `bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700`
- there is no shared token layer for metallic borders, glass blur, panel depth, glow, or motion timing

## Design Principles

1. Dark mode is the default product identity, not an alternate skin.
2. Gold is a signal of importance, not a background color.
3. Surfaces should stack by depth: base shell, panel, raised panel, overlay, CTA.
4. Motion should feel viscous and premium: short ease on tap, slower shimmer on hover.
5. Typography stays crisp and readable; the luxury feeling comes from spacing, materials, and restraint.
6. Visual effects must survive accessibility review. Contrast and focus are non-negotiable.

## Token System

### Core Surface Tokens

Add a new token family in [src/index.css](/C:/repos/chat2.0/src/index.css:1):

- `--bg-app: #080909`
- `--bg-shell: #0d0f10`
- `--bg-panel: rgba(18, 20, 22, 0.84)`
- `--bg-panel-strong: rgba(24, 26, 29, 0.94)`
- `--bg-panel-soft: rgba(255, 255, 255, 0.03)`
- `--bg-elevated: #17191c`
- `--bg-input: rgba(255, 255, 255, 0.04)`
- `--bg-input-focus: rgba(255, 255, 255, 0.06)`
- `--bg-overlay: rgba(5, 6, 7, 0.72)`

### Gold Tokens

- `--gold-1: #6f5318`
- `--gold-2: #9a7421`
- `--gold-3: #c9972f`
- `--gold-4: #edc86a`
- `--gold-5: #fff0b8`
- `--gold-accent: #d7aa46`
- `--gold-accent-strong: #efca72`
- `--gold-text: #f5d98d`
- `--gold-rim: linear-gradient(180deg, #fff0b8 0%, #d8aa46 35%, #7a5918 100%)`
- `--gold-fill: radial-gradient(circle at 30% 20%, rgba(255,240,184,0.22), rgba(215,170,70,0.14) 32%, rgba(24,20,10,0.9) 78%)`

### Border Tokens

- `--border-subtle: rgba(255,255,255,0.08)`
- `--border-panel: rgba(255,255,255,0.10)`
- `--border-glow: rgba(237,200,106,0.28)`
- `--border-strong: rgba(255,255,255,0.18)`

### Text Tokens

- `--text-primary: #f6f2e8`
- `--text-secondary: #c8c0b1`
- `--text-muted: #8f8779`
- `--text-inverse: #0b0b0b`
- `--text-gold: #f1d38a`

### Shadow And Glow Tokens

- `--shadow-panel: 0 12px 32px rgba(0,0,0,0.34)`
- `--shadow-panel-strong: 0 18px 50px rgba(0,0,0,0.42)`
- `--shadow-gold-soft: 0 0 0 1px rgba(215,170,70,0.24), 0 6px 20px rgba(215,170,70,0.18)`
- `--shadow-gold-cta: 0 0 0 1px rgba(255,240,184,0.2), 0 10px 26px rgba(201,151,47,0.28), inset 0 1px 0 rgba(255,255,255,0.18)`

### Radius Tokens

- `--radius-xs: 10px`
- `--radius-sm: 14px`
- `--radius-md: 18px`
- `--radius-lg: 24px`
- `--radius-xl: 32px`
- `--radius-pill: 999px`

### Motion Tokens

- `--ease-premium: cubic-bezier(0.22, 1, 0.36, 1)`
- `--ease-press: cubic-bezier(0.3, 0, 0.2, 1)`
- `--dur-fast: 140ms`
- `--dur-med: 220ms`
- `--dur-slow: 420ms`

## Component Rules

### Primary Button

Replace the current primary gradient button in [src/components/ui/Button.tsx](/C:/repos/chat2.0/src/components/ui/Button.tsx:1) with a liquid-gold rimmed button.

Required behavior:

- dark center, not a fully gold fill
- thin metallic gold rim
- inner warm reflection near top edge
- subtle hover shimmer from left to right
- small downward press on active
- stronger glow only on hover/focus, not at rest

Construction:

- outer border uses `--gold-rim`
- inner fill uses `--gold-fill`
- text uses `--gold-text`
- hover adds `transform: translateY(-1px) scale(1.01)`
- active adds `transform: translateY(1px) scale(0.99)`

Do not:

- use loud yellow fills
- use huge outer glows
- use a purple or blue accent inside the gold CTA

### Secondary Button

- graphite background
- subtle panel border
- no full gold fill
- gold highlight only on hover or selected state

### Ghost Button

- transparent background
- muted text
- hover introduces soft panel fill plus thin gold edge

### Danger Button

- remain red-based
- use darker garnet tones so it still fits the palette

### Inputs

Rework [src/components/ui/Input.tsx](/C:/repos/chat2.0/src/components/ui/Input.tsx:1) and the composer input in [src/components/chat/MessageInput.tsx](/C:/repos/chat2.0/src/components/chat/MessageInput.tsx:1):

- background should be smoked glass or dark satin, not light gray
- border should be subtle at rest
- focus ring should be gold, not generic accent hue
- placeholder should be warm muted gray, not cold blue-gray
- focus state should feel illuminated, not neon

### Cards And Panels

Used in:

- [src/components/layout/Sidebar.tsx](/C:/repos/chat2.0/src/components/layout/Sidebar.tsx:1)
- [src/components/settings/SettingsView.tsx](/C:/repos/chat2.0/src/components/settings/SettingsView.tsx:1)
- [src/components/profile/ProfileView.tsx](/C:/repos/chat2.0/src/components/profile/ProfileView.tsx:1)
- [src/components/dms/DirectMessagesView.tsx](/C:/repos/chat2.0/src/components/dms/DirectMessagesView.tsx:1)

Panel rules:

- use translucent dark backgrounds with backdrop blur where appropriate
- use brighter top border and darker body shadow to create depth
- avoid pure `bg-white dark:bg-gray-800`
- internal spacing should feel roomier and more intentional

### Message Bubbles

Group chat and DM bubbles should split into:

- self bubble: dark metallic-gold influenced fill only when the message is yours and important enough to deserve emphasis
- other bubble: neutral dark glass card with subtle border
- AI bubble: slightly different material, more obsidian with a warm edge, not the same as user messages

Tone indicators and reactions must stay readable on darker materials.

### Nav

Sidebar and mobile nav should feel like:

- smoked metal rail
- soft inset border
- active item gets gold rail and glass highlight
- icons should brighten on hover but stay muted at rest

### Modals And Pickers

Applies to emoji picker, notifications, upload menus, reaction menus.

- use darker overlays
- use glass panels with stronger blur
- use thin gold separators or selected states
- keep content panels readable, not decorative for decoration’s sake

## Page Treatments

### App Shell

Files:

- [src/App.tsx](/C:/repos/chat2.0/src/App.tsx:1)
- [src/index.css](/C:/repos/chat2.0/src/index.css:1)

Target:

- deep black-brown base field
- very soft background vignette
- optional brushed radial glow behind main content
- no flat `bg-gray-100 dark:bg-gray-900`

### Login

File:

- [src/components/auth/LoginForm.tsx](/C:/repos/chat2.0/src/components/auth/LoginForm.tsx:1)

Target:

- immersive dark entry screen
- centered premium auth card
- liquid gold primary CTA
- quieter secondary actions
- more dramatic brand mark

### Group Chat

File:

- [src/components/chat/ChatView.tsx](/C:/repos/chat2.0/src/components/chat/ChatView.tsx:1)

Target:

- command-deck feel
- elevated header rail
- pinned area as a premium strip, not a plain utility box
- composer dock should feel like hardware

### DMs

File:

- [src/components/dms/DirectMessagesView.tsx](/C:/repos/chat2.0/src/components/dms/DirectMessagesView.tsx:1)

Target:

- list column as smoked stacked panes
- active conversation with stronger gold-led focus
- unread badge in warm amber, not bright red unless truly urgent

### Profile

File:

- [src/components/profile/ProfileView.tsx](/C:/repos/chat2.0/src/components/profile/ProfileView.tsx:1)

Target:

- richer banner treatment
- profile card should feel editorial and premium
- stats cards use low-contrast glass with gold micro-highlights

### Settings

File:

- [src/components/settings/SettingsView.tsx](/C:/repos/chat2.0/src/components/settings/SettingsView.tsx:1)

Target:

- control-panel aesthetic
- toggles look like premium switches, not plain sliders
- scheme chips should become material swatches, not simple circles

## Theme Model Change

Current color schemes are hue swaps:

- `indigo`
- `teal`
- `rose`
- `violet`
- `orange`
- `contrast`

That model should change.

Recommended new scheme model:

- `obsidian-gold`
- `obsidian-champagne`
- `graphite-amber`
- `carbon-ivory`

If maintaining user-selectable schemes is important, keep the dark material system fixed and vary only the highlight metal tint. Do not keep the current rainbow-accent model.

## Typography

Base recommendation:

- UI/body: `Inter Tight`, `Manrope`, or `Plus Jakarta Sans`
- display/headings: `Sora`, `Clash Display`, or `Space Grotesk`

Rules:

- headings should feel sharper and more editorial
- small labels need better letter spacing
- avoid overusing all caps
- use weight and spacing, not giant size jumps

## Motion

Use motion in three layers:

- micro: button press, toggle switch, hover rise
- ambient: sheen sweep, subtle border flicker, panel reveal
- layout: staggered fade/slide on screen entry

Motion limits:

- no constant pulsing CTAs
- no floating cards everywhere
- no overshoot-heavy spring physics
- hover shimmer should be slow and rare enough to feel expensive

## Accessibility Rules

Must-have rules:

- gold text on dark backgrounds must meet contrast minimums
- focus-visible should be more obvious than hover
- selected state can never rely only on color
- blur layers must not reduce text clarity
- animation needs reduced-motion handling

## Implementation Order

### Phase 1: Foundation

Files:

- [src/index.css](/C:/repos/chat2.0/src/index.css:1)
- [src/hooks/useTheme.tsx](/C:/repos/chat2.0/src/hooks/useTheme.tsx:1)

Tasks:

- add full material token system
- redefine scheme model
- add reusable gold/glass utility classes
- establish background, border, glow, radius, and motion tokens

### Phase 2: Primitive Components

Files:

- [src/components/ui/Button.tsx](/C:/repos/chat2.0/src/components/ui/Button.tsx:1)
- [src/components/ui/Input.tsx](/C:/repos/chat2.0/src/components/ui/Input.tsx:1)
- [src/components/ui/RecordingIndicator.tsx](/C:/repos/chat2.0/src/components/ui/RecordingIndicator.tsx:1)
- [src/components/ui/RecordingPopup.tsx](/C:/repos/chat2.0/src/components/ui/RecordingPopup.tsx:1)

Tasks:

- implement liquid gold CTA
- implement dark input system
- update popups and overlays to match material rules

### Phase 3: Navigation And Layout

Files:

- [src/App.tsx](/C:/repos/chat2.0/src/App.tsx:1)
- [src/components/layout/Sidebar.tsx](/C:/repos/chat2.0/src/components/layout/Sidebar.tsx:1)
- [src/components/layout/MobileNav.tsx](/C:/repos/chat2.0/src/components/layout/MobileNav.tsx:1)
- [src/components/layout/MobileChatFooter.tsx](/C:/repos/chat2.0/src/components/layout/MobileChatFooter.tsx:1)

Tasks:

- rework shell background
- restyle nav selection and icon treatment
- make mobile/footer surfaces match the premium dark system

### Phase 4: Chat Core

Files:

- [src/components/chat/ChatView.tsx](/C:/repos/chat2.0/src/components/chat/ChatView.tsx:1)
- [src/components/chat/MessageInput.tsx](/C:/repos/chat2.0/src/components/chat/MessageItem.tsx:1)
- [src/components/chat/MessageItem.tsx](/C:/repos/chat2.0/src/components/chat/MessageItem.tsx:1)
- [src/components/chat/MessageList.tsx](/C:/repos/chat2.0/src/components/chat/MessageList.tsx:1)
- [src/components/chat/PinnedMessagesBar.tsx](/C:/repos/chat2.0/src/components/chat/PinnedMessagesBar.tsx:1)
- [src/components/chat/PinnedMessageItem.tsx](/C:/repos/chat2.0/src/components/chat/PinnedMessageItem.tsx:1)

Tasks:

- restyle message hierarchy
- make composer hardware-like
- make pinned UI elegant and premium
- clean duplicate pinned/message rendering behavior while touching this area

### Phase 5: DMs, Profile, Settings

Files:

- [src/components/dms/DirectMessagesView.tsx](/C:/repos/chat2.0/src/components/dms/DirectMessagesView.tsx:1)
- [src/components/profile/ProfileView.tsx](/C:/repos/chat2.0/src/components/profile/ProfileView.tsx:1)
- [src/components/settings/SettingsView.tsx](/C:/repos/chat2.0/src/components/settings/SettingsView.tsx:1)

Tasks:

- port the new material system through the rest of the product
- refine list rows, toggles, cards, and metrics

## Acceptance Criteria

The rework is successful when:

- the app feels premium and dark even with accents disabled
- the primary CTA looks distinct and memorable
- screens feel part of one material system, not styled page by page
- gold appears intentional, not scattered
- mobile and desktop both preserve the same visual identity
- there are no leftover bright Tailwind-gray surfaces in primary flows

## Immediate Next Step

Start with Phase 1 and Phase 2 together:

- replace the token system in [src/index.css](/C:/repos/chat2.0/src/index.css:1)
- update [src/hooks/useTheme.tsx](/C:/repos/chat2.0/src/hooks/useTheme.tsx:1) to the new scheme model
- rebuild [src/components/ui/Button.tsx](/C:/repos/chat2.0/src/components/ui/Button.tsx:1)
- rebuild [src/components/ui/Input.tsx](/C:/repos/chat2.0/src/components/ui/Input.tsx:1)

That will give the project its new visual DNA before we restyle individual screens.
