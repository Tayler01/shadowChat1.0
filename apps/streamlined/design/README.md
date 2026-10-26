# Streamlined brand artwork

The round UI mark is separate from the full edition's existing square app icon.
The generated source is `shado-round-mark-source.png`; the deployed 256px WebP
is `src/streamlined/assets/shado-round-mark.webp`. It preserves transparency
outside the circular badge and is rendered without a second clipping shape.
The original full-edition icon remains unchanged.

Generated with imagegen on October 22, 2026, using
`public/icons/app-icon-512.png` as the brand reference. Final generation prompt:

> Produce a polished ROUND SHADO app badge based on this exact logo. Replace the square/rounded-square app-icon tile with a PERFECTLY CIRCULAR solid matte charcoal disc (#17191C). Inside the disc retain the original silver S inside the silver-and-gold chat bubble with the small gold padlock, recognizable and fully visible. Remove the SHADO text. Enlarge and center only the S/chat/lock symbol tastefully inside the round badge, with 15 percent clear dark margin between symbol and circle perimeter. All negative space INSIDE the circle must be solid opaque charcoal, NOT transparent. ONLY the area OUTSIDE the perfectly circular badge is fully transparent. Smooth clean circular edge. Flat restrained silver-white and warm gold, clean premium app icon. No outer shadows, no glow, no textures, no white flecks, no square frame. Square canvas with a centered circular badge covering 90 percent of canvas. Designed for crisp 80px and40px rendering.

The source is retained at full resolution. The web derivative was resized and
encoded with the existing Sharp dependency (256x256, WebP quality 92,
alpha quality 100); no additional production dependency is required.
