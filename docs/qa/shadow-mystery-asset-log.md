# Shadow Mystery Asset Log

Last updated: 2026-05-20

## Purpose

Track generated and real Shadow Mystery launch assets, prompts, optimized repo
paths, dimensions, file sizes, usage, and attribution.

## Asset Standards

- Final app assets live under `public/entertainment/shadow-mystery/`.
- Prefer optimized WebP for app references.
- Keep art dark, premium, archival, and mobile-readable.
- Generated assets should avoid readable text unless explicitly required.
- Real copied images need attribution, source URL, and license notes in the app.

## Launch Asset Inventory

| Asset ID | Purpose | Source | Final path | Dimensions | Size | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `shadow-mystery-picker-banner` | Entertainment selector card | Generated image `ig_050cd2989aefbe09016a0e3b5843fc81948f12d1f169ac798f.png` | `public/entertainment/shadow-mystery/picker-banner.webp` | 1440x810 | 100,798 bytes | Generated picker atmosphere, no text |
| `school-four-cover` | Story cover | Generated image `ig_050cd2989aefbe09016a0e3b827fe881948eb60477d7e67aea.png` | `public/entertainment/shadow-mystery/school-four/cover.webp` | 900x1125 | 143,248 bytes | Generated cover art |
| `school-four-header` | Story/app header | Generated image `ig_050cd2989aefbe09016a0e3bb805208194a51739ba078f18da.png` | `public/entertainment/shadow-mystery/school-four/header.webp` | 1600x686 | 122,548 bytes | Generated wide header art |
| `school-four-classroom-memory` | Story section image | Generated image `ig_050cd2989aefbe09016a0e3be13c288194885c7dfa67ede4d1.png` | `public/entertainment/shadow-mystery/school-four/classroom-memory.webp` | 1280x720 | 111,280 bytes | Generated early-school atmosphere |
| `school-four-highway-fracture` | Story section image | Generated image `ig_050cd2989aefbe09016a0e3c136f348194a5e51e796e7c63e1.png` | `public/entertainment/shadow-mystery/school-four/highway-fracture.webp` | 1280x720 | 126,946 bytes | Generated I-95 isolation beat |
| `school-four-auditorium-folklore` | Story section image | Generated image `ig_050cd2989aefbe09016a0e3c3fd1c88194922a13fd0ab4373f.png` | `public/entertainment/shadow-mystery/school-four/auditorium-folklore.webp` | 1280x720 | 74,598 bytes | Generated folklore/auditorium beat |
| `school-four-real-public-school-four-2013` | Real story image | Wikimedia Commons, Erin Murphy, CC BY-SA 2.0 | `public/entertainment/shadow-mystery/school-four/real/public-school-four-2013.webp` | 1280x854 | 194,838 bytes | Real Public School Four photo |
| `school-four-real-annie-lytle-2012` | Real story image | Wikimedia Commons, Excel23, CC BY-SA 4.0 | `public/entertainment/shadow-mystery/school-four/real/annie-lytle-school-2012.webp` | 1280x846 | 87,274 bytes | Real Annie Lytle School photo |

## Source And License Links

- Public School Four photo by Erin Murphy:
  `https://commons.wikimedia.org/wiki/File:Public_School_Four_(8404375300).jpg`
- AnnieLytleSchool photo by Excel23:
  `https://commons.wikimedia.org/wiki/File:AnnieLytleSchool.jpg`

## Optimization Notes

- Generated PNGs were copied from
  `C:\Users\tayle\.codex\generated_images\019e477e-c146-7581-9c2e-913be453e35a`
  and converted to WebP with repo-local `sharp`.
- Commons images were downloaded through Wikimedia file redirect thumbnails,
  converted to WebP with repo-local `sharp`, and credited in story captions and
  footer source notes.
