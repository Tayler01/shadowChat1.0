"""Original Shadow Checkers geometry. Run with Blender 4.5 --background --python.
Editable source is saved beside this script; runtime exports live in Resources.
"""
import bpy
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'Assets' / 'Resources' / 'Models'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def mat(name, color, metal):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = .3
    return m

body = mat('FactionMetal', (.72, .39, .09), .7)
edge = mat('InlaidMetal', (.94, .73, .32), .8)
enamel = mat('InsetEnamel', (.035, .04, .05), .3)

def cylinder(name, radius, depth, z, material, vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(0, 0, z))
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    bevel = o.modifiers.new('Machined bevel', 'BEVEL')
    bevel.width = .025
    bevel.segments = 3
    o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return o

def torus(name, major, minor, z, material):
    bpy.ops.mesh.primitive_torus_add(major_segments=48, minor_segments=8, location=(0,0,z), major_radius=major, minor_radius=minor)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth=True
    return o

def token(king):
    cylinder('Marble foot', .372, .085, .043, body,64)
    cylinder('Carved stone waist', .346, .15, .135, body,64)
    cylinder('Polished marble face', .370, .075, .222, enamel,64)
    torus('Lower silver inlay', .351, .008, .095, edge)
    torus('Face silver inlay', .304, .007, .264, edge)
    if king:
        cylinder('King upper stone',.344,.15,.345,body,64)
        cylinder('King marble cap',.37,.075,.445,enamel,64)
        torus('King silver inlay',.304,.009,.487,edge)

def export(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.fbx(filepath=str(OUT / f'{name}.fbx'),use_selection=True,object_types={'MESH'},axis_forward='-Z',axis_up='Y',apply_unit_scale=True,bake_anim=False)
    collection=bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    for obj in list(bpy.context.selected_objects):
        for c in list(obj.users_collection): c.objects.unlink(obj)
        collection.objects.link(obj)
    collection.hide_viewport=True
    collection.hide_render=True
    bpy.ops.object.select_all(action='DESELECT')

token(False); export('WarToken')
token(True); export('CrownToken')
bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0))
tile=bpy.context.object
tile.name='Hand-cut stone tile'
tile.scale=(.986,.986,.12)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bevel=tile.modifiers.new('Stone bevel','BEVEL'); bevel.width=.02; bevel.segments=2
tile.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
tile.data.materials.append(enamel)
export('BoardTile')
bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0))
slab=bpy.context.object; slab.name='Beveled marble surround'; slab.scale=(9.62,9.62,.34)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bevel=slab.modifiers.new('Polished eased stone edge','BEVEL');bevel.width=.11;bevel.segments=5
slab.modifiers.new('Stone weighted normals','WEIGHTED_NORMAL');slab.data.materials.append(enamel)
export('MarbleSurround')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'ArtSource' / 'ShadowCheckers.blend'))
print('SHADOW_CHECKERS_ASSETS_READY')
