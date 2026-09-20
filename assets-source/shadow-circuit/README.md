# Shadow Circuit editable art

`classic-kit/` is the current source: 13 original Blender GLBs, editable `.blend`, contact sheet and measured/hash manifest. The user requested classic gray/green styling on 2026-09-20. Older `calibration/` exports remain historical; they are not the current runtime palette.

Rebuild:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.5\blender.exe' --background --python tools/shadow-circuit/blender/build_calibration.py
npm run shadow-circuit:validate-assets
```

Copy reviewed GLBs from `classic-kit/` into `src/features/games/shadow-circuit/assets/classic/` after validation. The exporter bakes transforms and exports solid materials without UVs, skins or animation. The runtime's bounded static GLB profile rejects unsupported features. Source hashes and triangle ceilings are checked independently with the Khronos validator.

Kit: gray floor/wall, green explorer with glasses, red bug, four colored keys and matching keyhole blocks, DIP chip. Total 311,356 bytes; zero Khronos errors/warnings. Static models are integrated and screenshot-reviewed, but final HD art, animation, the remaining roster and audio are still open.
