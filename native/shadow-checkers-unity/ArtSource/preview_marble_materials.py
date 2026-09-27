"""Non-production Cycles study using the game's original checkers meshes.

Run Blender --background --python ArtSource/preview_marble_materials.py.
The editable material study and render are written only under output/.
Unity material integration and its mobile validation remain separate steps.
"""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parents[1] / 'output' / 'shadow-checkers-material-study'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.render.resolution_x = 1000
scene.render.resolution_y = 750
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.09, .12, .17, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .16


def surface(name, color, roughness, metal=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    return mat, shader


def marble(name, light, board=False):
    mat, shader = surface(name, (.6, .65, .7) if light else (.02, .025, .03), .19)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    coords = nodes.new('ShaderNodeTexCoord')
    mapping = nodes.new('ShaderNodeVectorMath')
    mapping.operation = 'SCALE'
    mapping.inputs[3].default_value = .95 if not board else .48
    links.new(coords.outputs['Object'], mapping.inputs[0])
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(ROOT / 'Assets/Resources/Textures/BlackMarbleColor.jpg'), check_existing=True)
    tex.projection = 'BOX'
    tex.projection_blend = .25
    links.new(mapping.outputs[0], tex.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.label = 'Slate veins in silver stone' if light else 'Silver veins in obsidian stone'
    ramp.color_ramp.interpolation = 'EASE'
    ramp.color_ramp.elements[0].position = .015
    ramp.color_ramp.elements[0].color = ((.58, .64, .70, 1) if board else (.32, .39, .47, 1)) if light else (.009, .014, .020, 1)
    ramp.color_ramp.elements[1].position = .27
    ramp.color_ramp.elements[1].color = (.045, .07, .105, 1) if light else (.48, .56, .65, 1)
    links.new(tex.outputs['Color'], ramp.inputs[0])
    links.new(ramp.outputs[0], shader.inputs['Base Color'])
    # Broad polish variation, without making honed marble look like rough rock.
    polish = nodes.new('ShaderNodeMapRange')
    polish.inputs['From Min'].default_value = 0
    polish.inputs['From Max'].default_value = .4
    polish.inputs['To Min'].default_value = .13
    polish.inputs['To Max'].default_value = .23
    links.new(tex.outputs['Color'], polish.inputs['Value'])
    links.new(polish.outputs[0], shader.inputs['Roughness'])
    return mat


silver_stone = marble('Study / veined silver marble', True)
black_stone = marble('Study / veined black marble', False)
silver_tile = marble('Study / light marble board', True, board=True)
black_tile = marble('Study / black marble board', False, board=True)
silver, _ = surface('Study / brushed silver inlay', (.62, .69, .78), .22, 1)
bronze, _ = surface('Study / aged frame bronze', (.35, .21, .085), .3, 1)
wood, wood_shader = surface('Study / dark walnut table', (.09, .035, .012), .33)
wood_tex = wood.node_tree.nodes.new('ShaderNodeTexImage')
wood_tex.image = bpy.data.images.load(str(ROOT / 'ArtSource/Textures/OakColor.jpg'), check_existing=True)
wood_tex.projection = 'BOX'
wood_tex.projection_blend = .15
wood_coords = wood.node_tree.nodes.new('ShaderNodeTexCoord')
wood.node_tree.links.new(wood_coords.outputs['Generated'], wood_tex.inputs['Vector'])
tint = wood.node_tree.nodes.new('ShaderNodeMixRGB')
tint.blend_type = 'MULTIPLY'
tint.inputs[0].default_value = 1
tint.inputs[2].default_value = (.19, .11, .06, 1)
wood.node_tree.links.new(wood_tex.outputs['Color'], tint.inputs[1])
wood.node_tree.links.new(tint.outputs[0], wood_shader.inputs['Base Color'])


def block(name, position, dimensions, material, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    edge = obj.modifiers.new('Hand finished edge', 'BEVEL')
    edge.width, edge.segments = bevel, 3
    obj.modifiers.new('Weighted face normals', 'WEIGHTED_NORMAL')
    return obj


block('Writing table', (0, 0, -.66), (22, 20, .38), wood, .06)
block('Wooden board case', (0, 0, -.27), (9, 9, .42), wood, .06)
block('Bronze reveal', (0, 0, -.065), (8.78, 8.78, .035), bronze, .018)
block('Black marble surround', (0, 0, -.025), (8.66, 8.66, .09), black_stone, .028)
for row in range(8):
    for col in range(8):
        tile = block(f'Marble square {row}-{col}', (col-3.5, row-3.5, .045), (.992, .992, .075), black_tile if (row+col)%2 else silver_tile, .009)
        tile.rotation_euler.z = ((row*3+col)%4)*math.pi/2


def token(name, mesh_name, x, y, light, angle=0):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(ROOT / 'Assets/Resources/Models' / f'{mesh_name}.fbx'))
    imported = set(bpy.data.objects)-before
    holder = bpy.data.objects.new(name, None)
    scene.collection.objects.link(holder)
    for obj in imported:
        if obj.parent not in imported:
            obj.parent = holder
        if obj.type == 'MESH':
            metal = any(part in obj.name.lower() for part in ('rim', 'inlay', 'stud', 'crest'))
            obj.data.materials.clear()
            obj.data.materials.append(silver if metal else silver_stone if light else black_stone)
    holder.location = (x, y, .083)
    holder.rotation_euler.z = angle


token('Silver player', 'WarToken', -.5, -2.5, True, .25)
token('Black player', 'WarToken', .5, -1.5, False, -.45)
token('Silver king', 'CrownToken', 1.5, -2.5, True, .8)
token('Black king', 'CrownToken', -1.5, -.5, False, .5)


def area(name, position, target, power, color, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.color, data.shape, data.size = power, color, 'DISK', size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()


area('Warm study key', (-4, -2, 6), (0, -1, 0), 800, (1, .72, .43), 4)
area('Cool window reflection', (3, 3, 6), (0, -1, 0), 1100, (.58, .73, 1), 5)
area('Candle edge reflection', (1, -5, 2), (0, -1, .2), 95, (1, .48, .2), .65)
camera_data = bpy.data.cameras.new('Material review camera')
camera = bpy.data.objects.new('Material review camera', camera_data)
scene.collection.objects.link(camera)
camera.location = (4.7, -8.7, 5.6)
camera.rotation_euler = (Vector((0, -1.65, .2))-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.lens = 61
scene.camera = camera
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(OUT / 'silver-black-marble.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'MarbleMaterialStudy.blend'))
bpy.ops.render.render(write_still=True)
print('MARBLE_MATERIAL_STUDY_READY', flush=True)
