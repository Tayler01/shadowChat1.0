# Shadow Runner Rebuild Art

Custom ImageGen raster production, September 2026. Original masters stay here;
only optimized derivatives are shipped from `public/games/shadow-runner/rebuild`.
Rebuild with `node scripts/process-shadow-runner-rebuild-assets.mjs`.
The generated manifest records dimensions, byte sizes, and source/output hashes.

## Story Landmarks And Act Transitions

September 30: nine genuine-alpha ImageGen landmarks and three cinematic act
tableaux are retained with exact prompts and unmodified PNG masters. Run
`node scripts/process-shadow-runner-story-assets.mjs` to reproduce derivatives.
Landmarks are 128x128 lossless WebPs below40KB each; cinematic backgrounds are
1536x864 WebPs below300KB each. The processing manifest records crop geometry,
source/output hashes, dimensions and bytes.

Each chapter loads only its landmark sprite. Static terrain-supported images
sit behind actors with no collision bodies or per-frame updates. Act artwork
appears in the existing Level1,4,8 briefing, adding no mandatory extra screen.
Text remains accessible DOM content. ActIII remains pre-dawn, not restoration.

The separate generated district-depth atlas adds chapter-specific hanging
architecture to Levels1-7, each at two restrained camera-relative rates. Small
upper-screen props are non-colliding and never masquerade as walkable platforms.
Existing Catacomb/Stormwatch/Relay depth layers remain unchanged. All ten
districts now have separate depth sprites; Comfort freezes decorative travel.

## Courier Catacombs Panorama And Hanging Lantern

Generated with built-in ImageGen on September 12. Exact prompts are in
`courier-catacombs-prompt.md` and `catacomb-hanging-lantern-prompt.md`.
Unmodified PNG masters are retained beside those prompts. The new vault
panorama removes the former foreground floor; actual collision terrain remains
unchanged. Derivatives are a 1536x864 background (202,222 bytes), 320x180
thumbnail (9,900 bytes), and transparent 72x404 lantern (24,878 bytes).

The lantern is mechanically trimmed/resized from genuine generated alpha,
not a background-removal approximation. Eleven fixed image objects form two
camera-relative layers at 0.16 and 0.28 travel; no bodies, particles, or timers.
Comfort freezes decorative travel in place. These atmospheric lamps are
distinct from the existing amber checkpoint wayposts and collectible items.

`runner-catacomb-depth-Di-c5dCm-01` passed Chromium and WebKit launch, ordinary
starting-floor movement, distinct layer displacement, nonblank canvas pixels,
asset loading, and pause stability. Phone screenshots were reviewed; no page
errors, horizontal overflow, or duplicate canvas. This is art acceptance for
the starting area, not a full Catacombs route or spectral-path audit.

## Candle Fair Ruins

- Built-in ImageGen, September12: `exec-24605ed5-9bca-4c02-8a90-a219ea861fbf`.
- Unmodified1672x941master: `candle-fair-master.png`; exact prompt in
  [candle-fair-prompt.md](candle-fair-prompt.md).
- Distant ruined festival towers and tent roofs replace the legacy foreground
  fake platforms. No new collision geometry or procedural substitute art.
- Optimized1536x864background210268bytes and320x180thumbnail11478bytes.
  Existing processor and manifest preserve source/outputSHA256.
- Integrated in Level5 and its campaign detail; bounded backdrop motion honors
  Comfort. Both Chromium and WebKit phone launch/pause checks passed, actual
  play/briefing screenshots reviewed in `runner-candle-fair-art-DFLQg13v-01`.
  No overflow or page errors. Full routes and physical-device checks remain.
- A panorama is not the full layered-depth requirement; world-space landmarks
  and separable layers stay open in the rebuild acceptance plan.

## East Gate Moonrise

- Source: built-in ImageGen, generation `exec-fe9ef1a8-a3b4-4396-9306-7810f37052b8`.
- Purpose: opening chapter background and briefing; distant environment only.
- Art direction: meticulous high-end hand-pixelled 2D game art, pale limestone
  East Gate towers above a river valley, full moon to the left, desaturated teal
  night, silver stone, restrained warm gold windows, muted wine-colored banners.
  Keep the lower play plane visually quiet, with no foreground platforms,
  characters, text or HUD. Compatible with the existing hooded, gold-eyed courier.
- Visual review: approved for integration as a background, not collision art.
  In-game readability and performance acceptance remain pending.
- Master is preserved unmodified. WebP conversion and thumbnail resizing are
  mechanical preparation only; no procedural replacement artwork.

## Silver Courier Walkway

- Source: built-in ImageGen, generation `exec-d20e424a-ba9e-4083-b715-29c092df8844`.
- Purpose: bright readable opening-district masonry. Single transparent sprite,
  not a scene or replacement collider. Approved for integration; phone contact
  alignment and runtime use still pending.
- Prompt: One production-ready straight-on side-view terrain sprite for a
  hand-pixelled dark-fantasy courier platformer. A long horizontal floating
  castle walkway on true transparent alpha, full object visible. Absolutely
  straight pale silver limestone top, restrained worn gold edging, cool gray
  blocks, tiny ivy leaves below only. No arches, posts, objects, shadows, haze,
  characters, UI, text, checkerboard or solid backdrop. Vertical ends, shallow
  ruined underside, readable pixel clusters without noisy microdetail.
- Alpha inspected: original 2161x728, visible bounds x66..2095/y250..511.
  Remove transparent margins only; prepare lossless 1024x132 WebP. Preserve
  original, cropped derivative dimensions and hashes in the manifest.

## Moonlit Causeway

- Source: built-in ImageGen, generation `exec-71a39242-e45b-40fe-82fd-6d19b532d92c`.
- Purpose: replace the smooth painterly district backdrop and misleading
  foreground bridge with coherent pixel art and an unobstructed play plane.
- Prompt: 16:9 gothic medieval pixel-art lake beneath distant broken aqueducts,
  pale limestone relay towers on rocky islands, moonlit waterfalls, distant
  burgundy banners and sparse gold beacon windows. A cloud-veiled moon upper
  left, cathedral skyline upper right. Deep teal water, silver stone, plum
  shadows. Lower scene is calm receding water and reflected moonlight, without
  close horizontal bridges, platforms, floors, railings or foreground pillars.
  Coherent hand-pixelled clusters, not photorealism, no blur, characters, UI,
  icons or text. Compatible with the existing gold-eyed hooded courier and
  bright silver playable masonry. Three moon-glass shards preserve the city's
  true relay command.
- Master preserved unmodified. Background and thumbnail are mechanically
  resized WebP derivatives. In-game visual acceptance remains pending.

## Finale: Broken Crown and Relay Ignition

Generated 2026-09-08 with built-in ImageGen. Dark crown is a new original;
ignition is an edit preserving its camera, courier and architecture. Both
masters are retained. Ship only 1536x864 WebP from the processing script.
Reviewed full image: no baked text, no premature sunrise, no detached UI.
The existing dawn-restored-ending remains the final city-wide reveal.

### Broken Crown Prompt

Create a premium hand-crafted pixel-art cinematic for Shadow Runner, a 2D dark medieval courier adventure. 16:9 wide full-bleed game illustration, crisp deliberate pixel clusters, richly detailed Gothic architecture, NOT vector, NOT photographic, no text or UI. Scene ONE of a final ending: the Master Lock has just broken but dawn has NOT arrived. On the summit of a Gothic relay spire at deep blue night, a huge defeated empty iron sovereign knight's helmet lies cracked beside a snapped gold command seal in right foreground; no gore, no body. Left of center a small black-hooded courier with luminous two gold eyes, dark grey cloak, brown leather messenger satchel and short sheathed sword faces away toward an UNLIT narrow silver-and-brass relay pedestal. Behind them a vast sleeping medieval city, distant bell towers and aqueducts, cold moonlight and dim windows. Emotional quiet after battle. Tiny human-scale courier, monumental setting, clear silhouette. Palette obsidian, cool silver stone, desaturated teal skyline and restrained tarnished gold. Main visual subjects between upper 15% and middle 70%, bottom 25% quiet dark paving where DOM captions will appear. No letters, runes that resemble writing, watermark, border, split panel, speech bubble, foreground HUD or glowing active beacon. Make architecture and pixel style compatible with carefully drawn premium 16-bit dark fantasy.

### Relay Ignition Prompt

Create the NEXT cinematic frame of this Shadow Runner ending by editing this reference, keeping the exact courier design, camera composition, architecture, cracked sovereign helmet and deliberate detailed pixel-art rendering. The small black-hooded courier with leather satchel has now stepped to the relay and places the sealed dispatch against it with one raised hand. The previously dark silver-and-brass relay ignites with a narrow luminous ivory-gold flame inside its top cage, lighting the courier's hood edge, pavement and nearby pillars. A thin golden message-light thread travels outward from this beacon to TWO distant towers only; most of the city remains cool and dark because the restoration is only beginning. Deep midnight-indigo sky with a very subtle pale teal horizon, NO sunrise yet. No giant magic orb, no particle cloud obscuring shapes, no flash covering frame. Composition remains upper/middle subjects with quiet dark lower quarter for DOM captions. No text, writing, UI, logo, border. Wide16:9 full-bleed premium dark fantasy game cinematic, crisp pixel clusters not photo or vector. Preserve the cold-to-warm emotional contrast and coherent architecture.

## Lantern Market Panorama

Generated 2026-09-08 with built-in ImageGen. Preserves amber lanterns and
Gothic rooftops while removing near-camera fake platforms. New master retained;
1536x864 background and 320x180 thumbnail prepared by the shared processor.
Phone acceptance pending at integration.

### Prompt

Create a custom distant background panorama for Shadow Runner Level 2, Lantern Market Roofs, a premium 2D side-scrolling dark medieval courier game. 16:9 wide full-bleed, richly detailed hand-crafted pixel art, crisp deliberate pixels, not vector or photograph. A layered medieval hillside market in cool night air: pale moon high left, tiers of smaller half-timbered buildings with muted plum slate roofs, a great Gothic gate tower far right, hanging amber lantern strings connecting distant rooftops, closed stalls and canvas awnings far BELOW viewpoint. Abandoned but beautiful, mystery of undelivered letters, gentle violet-to-teal night skyline with restrained amber lights and silver highlights. ALL architecture is distant and reduced contrast, no large near-camera roof, no foreground ledges, no horizontal walkable-looking ground; leave lower 35 percent as calm desaturated shadowed valley/market depth so separate bright gameplay platforms and gold coins remain unambiguous. Readable large shapes, layered air and depth, no blur. Keep architectural craft and melancholic wonder of classic high-quality 16-bit gothic platformers with modern lighting. No characters, enemies, coins, HUD, text, runes, signs with letters, logos, borders, or photorealism. No discrete decorative light orbs. This image is BACKGROUND ONLY, not the playable map.


## Courier Waypost

Generated with built-in ImageGen on 2026-09-08. The approved compact iron
waypost has genuine alpha and no stone-preview pattern. The processor removes
the margins outside the visible silhouette (alpha above 4/255), preserving the
original master and real object. A strict alpha-above-zero crop was rejected by
phone QA because nearly invisible matte specks padded the object to a tiny size.
The corrected derivative is a tightly framed 64x176 lossless WebP with its feet
at the bottom anchor. Geometry-aware checkpoint placement is integrated:
full-height posts in open areas, proportionate compact posts in low clearances,
muted before activation and bright afterward. They add no collision bodies.
Fresh phone visual acceptance remains pending.

Additional Ivy, Bell Tower and Clockmaker masters and exact prompts are recorded
in [district-prompts.md](district-prompts.md).

Final-chapter solid cover and recovery-step art is documented in
[relay-masonry-prompt.md](relay-masonry-prompt.md). It replaces misleading
stair/pillar silhouettes with generated masonry assembled at uniform pixel
scale, without changing the authored collision rectangles.

Earlier tall stone-post revisions and the edited unlit variants were rejected:
they had checker-like texture or baked backgrounds. They are NOT runtime art.
The approved master is courier-waypost-master.png; original generated file
exec-057eb2a0-e9fc-466b-8333-740965fbdfd5.png. No rejected file is referenced.

### Prompt

A single isolated pixel-art game sprite on a transparent background: a small medieval courier waypost, a warm amber brass lantern mounted on a short dark wrought-iron stake with two small gold wings immediately under the lantern. Flat level forked iron base. Light is contained inside the glass. No surrounding glow. Squat compact readable silhouette, object width roughly half its height, centered in a square image. Hand-crafted crisp 16-bit fantasy pixel art, no texture noise. The lantern has a silver metal roof, amber glass, a tiny ivory flame and brass ribs; the stake is charcoal iron with a clean silver left rim. One object only, no ground, no floor shadow, no scene, no lettering. Pixel complexity suitable for a 48x96 sprite used in a side-scrolling gothic courier game. Solid opaque object on real transparent alpha background. No stone column. No photo. No reference sheet or alternate version.
