# Surface texture credits

- **Scholar portrait** (`StudyPortrait.png`): original AI-generated fictional Renaissance scholar painting, September 26, 2026, created with OpenAI image generation for this project. No historical portrait was copied. Source image retained at 1024 x 1536; Unity imports a mipmapped 512 px ASTC texture for WebGL. Modeled frame is original project geometry.

These PBR texture maps are CC0 assets; the game meshes and implementation are original to this project.

- **Wood Table 001**, Poly Haven, Dimitrios Savva / Rico Cilliers: https://polyhaven.com/a/wood_table_001 — 2K diffuse, OpenGL normal and roughness maps.
- **Marble 01**, Poly Haven: https://polyhaven.com/a/marble_01 — 2K diffuse map for study stonework (internal texture filename SilverMarbleColor).
- **Old Stone Wall 02**, Charlotte Baglioni, Poly Haven: https://polyhaven.com/a/old_stone_wall_02 — CC0 1K diffuse and OpenGL normal source maps for the hearth; downloaded September 13, 2026. Dedicated runtime stone material added September 26, using 1K color and 512 px normal imports for WebGL, plus modeled masonry and baked vertex contact shading.
- **Marble 006**, ambientCG: https://ambientcg.com/view?id=Marble006 — 2K color map for black marble; the silver faction uses a light variation in the material shader.
- **Brown Leather**, Rob Tuytel, Poly Haven: https://polyhaven.com/a/brown_leather — CC0 roughness photograph, downloaded September 25, 2026; original 1K JPEG retained as `LeatherRough.jpg` (MD5 `0f3a0148c8d2d25fbeca67e64e79bca0`), imported at 256 px for WebGL. Shared spatial grain modulates the existing colored book bindings and folios. License verified on the asset page September 25, 2026.

Licenses verified September 13, 2026: https://polyhaven.com/license and https://ambientcg.com/view?id=Marble006 (CC0 license statement). Maps are bundled locally; the game does not contact the asset providers.

- **Orbis terrae compendiosa descriptio**, Rumold Mercator, 1587, published in the 1595 atlas. Public-domain reproduction: https://commons.wikimedia.org/wiki/File:Mercator_World_Map.jpg — used for the framed study map and desk parchment. Original image: https://upload.wikimedia.org/wikipedia/commons/5/58/Mercator_World_Map.jpg . Public-domain status verified September 13, 2026.
