"""One-time targeted refresh of the pre-edge saved study blend.

Run Blender --background ArtSource/MedievalStudy.blend --python
ArtSource/refresh_study_paper_edges.py. Future full bakes use study_details.py
directly; this avoids rebaking unrelated room lightmaps for this update.
"""
import math
import os
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'ArtSource'))
from study_details import map_edge_tint, paper_edge_multiplier

models = ROOT / 'Assets/Resources/Models'
staging = ROOT / 'Temp/StudyExports'
staging.mkdir(parents=True, exist_ok=True)
paper = bpy.data.objects['StudyPaper']
maps = bpy.data.objects['StudyMaps']
if paper.get('refreshed_paper_edges') or maps.get('refreshed_map_edges'):
    raise RuntimeError('This one-time targeted paper refresh was already applied to the blend')

# The saved blend already includes AO in SurfaceTint. Multiplication preserves
# that shading; no paper material or draw group changes.
tint = paper.data.color_attributes['SurfaceTint']
normals = paper.matrix_world.to_3x3()
paper_faces = 0
for face in paper.data.polygons:
    normal = (normals @ face.normal).normalized()
    if abs(normal.z) >= .90:
        continue
    paper_faces += 1
    for index in face.loop_indices:
        world = paper.matrix_world @ paper.data.vertices[paper.data.loops[index].vertex_index].co
        fade = paper_edge_multiplier(normal, world)
        value = tint.data[index].color
        tint.data[index].color = (value[0]*fade[0], value[1]*fade[1], value[2]*fade[2], value[3])

uv = maps.data.uv_layers['UVMap'].data
tint = maps.data.color_attributes['SurfaceTint']
wall_loops = 0
table_vertices = {}
for loop in maps.data.loops:
    world = maps.matrix_world @ maps.data.vertices[loop.vertex_index].co
    u, v = uv[loop.index].uv
    if world.z > 1:
        old = map_edge_tint(u, v, False, refreshed=False)
        new = map_edge_tint(u, v, False, refreshed=True)
        value = tint.data[loop.index].color
        tint.data[loop.index].color = tuple(value[i]*new[i]/max(.001,old[i]) for i in range(3)) + (value[3],)
        wall_loops += 1
    else:
        table_vertices[loop.vertex_index] = (u, v)

# Tiny irregular bites along only the exposed tabletop map outlines. The
# center and its source UVs stay intact, retaining the original cartography.
inverse = maps.matrix_world.inverted()
outline_vertices = 0
for index, (u, v) in table_vertices.items():
    vertex = maps.data.vertices[index]
    world = maps.matrix_world @ vertex.co
    center_x, center_y, max_x = (-7.1, 5.6, 1.8) if world.x < 0 else (7.3, -1.5, 1.95)
    local_x, local_y = world.x-center_x, world.y-center_y
    if u < .001 or u > .999:
        cut = .019 + .016*(.5+.5*math.sin(local_y*13+local_x*2))
        world.x -= math.copysign(cut, local_x)
        outline_vertices += 1
    if v < .001 or v > .999:
        cut = .016 + .018*(.5+.5*math.sin(local_x*11-local_y*3))
        world.y -= math.copysign(cut, local_y)
        outline_vertices += 1
    vertex.co = inverse @ world

paper.data.update()
maps.data.update()
paper['refreshed_paper_edges'] = True
maps['refreshed_map_edges'] = True

for name in ('StudyPaper', 'StudyMaps'):
    bpy.ops.object.select_all(action='DESELECT')
    obj = bpy.data.objects[name]
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    pending = staging / (name + '.fbx')
    bpy.ops.export_scene.fbx(filepath=str(pending), use_selection=True,
                             object_types={'MESH'}, axis_forward='-Z', axis_up='Y',
                             apply_unit_scale=True, bake_anim=False, colors_type='LINEAR')
    os.replace(pending, models / pending.name)

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'ArtSource/MedievalStudy.blend'))
print('TARGETED_PAPER_EDGES_READY', {'paper_faces': paper_faces,
      'wall_loops': wall_loops, 'outline_vertices': outline_vertices}, flush=True)
