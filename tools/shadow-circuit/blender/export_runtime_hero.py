"""Keep the detailed authoring model and export a gameplay-size LOD separately."""
import bpy
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
kit = root / 'assets-source/shadow-circuit/circuit-kit-v2'
bpy.ops.wm.open_mainfile(filepath=str(kit / 'calibration.blend'))
bpy.ops.object.select_all(action='DESELECT')
hero = bpy.data.objects['hero-explorer']
hero.hide_set(False)
hero.select_set(True)
bpy.context.view_layer.objects.active = hero
hero.location = (0, 0, 0)
modifier = hero.modifiers.new('Gameplay LOD', 'DECIMATE')
modifier.ratio = .52
modifier.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=modifier.name)
hero.data.calc_loop_triangles()
out = kit / 'runtime-lod'
out.mkdir(exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out / 'hero-explorer.glb'), export_format='GLB',
    use_selection=True, export_apply=True, export_yup=True, export_animations=False,
    export_extras=True, export_texcoords=False, export_cameras=False, export_lights=False)
(out / 'manifest.json').write_text(json.dumps({'source': '../calibration.blend',
    'triangles': len(hero.data.loop_triangles), 'ratio': .52}, indent=2), encoding='utf-8')
