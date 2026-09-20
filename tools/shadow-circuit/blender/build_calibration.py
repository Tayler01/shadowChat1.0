"""Original Shadow Circuit art calibration; run in Blender 4.5 background mode.

blender --background --python tools/shadow-circuit/blender/build_calibration.py
The resulting sources stay outside public until geometry, visuals and payload pass.
"""
import bpy
import json
import math
import hashlib
import uuid
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'assets-source/shadow-circuit/circuit-kit-v2'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.render.resolution_x = 1600
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.world.color = (.12, .15, .2)
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.render.fps = 24
scene.frame_end = 48

PALETTE = {
    'obsidian': ('#b8b8b8', .1, .6), 'edge': ('#60645f', .18, .48),
    'bronze': ('#dddddd', .45, .32), 'cloth': ('#289837', 0, .8),
    'blue': ('#12cbe0', .3, .28), 'eye': ('#f6f6e8', .1, .25),
    'red': ('#e62f28', .3, .35), 'rubber': ('#1c2227', 0, .7),
    'green': ('#1edb33', .3, .3), 'yellow': ('#f3e624', .3, .3),
    'skin': ('#f1c78d', 0, .7), 'hair': ('#624b30', 0, .8),
    'pants': ('#166329', 0, .65), 'pack': ('#463a25', 0, .7),
    'hair-light': ('#8b633d', 0, .45), 'orange': ('#ff7024', .1, .32),
    'purple': ('#894cd1', .25, .28), 'pink': ('#e3718f', .1, .4),
    'portal': ('#0755ec', .25, .22), 'light-blue': ('#8bffff', .2, .2),
    'earth': ('#95663e', 0, .85), 'water': ('#008cba', .3, .22),
}
materials = {}
for name, (color, metal, rough) in PALETTE.items():
    rgb = tuple(int(color[i:i+2], 16) / 255 for i in (1, 3, 5))
    linear = tuple(((v+.055)/1.055)**2.4 if v>.04045 else v/12.92 for v in rgb)
    mat = bpy.data.materials.new('circuit-' + name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*linear, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    materials[name] = mat

parts = []
def finish(obj, name, material):
    obj.name = name
    obj.data.materials.append(materials[material])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    parts.append(obj)
    return obj

def box(name, position, size, material, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.scale = size
    finish(obj, name, material)
    if bevel:
        modifier = obj.modifiers.new('cut-edge', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2 if name.startswith(('glasses','boot','coat','pack')) else 1
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj

def sphere(name, position, size, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=1, location=position)
    obj = bpy.context.object
    obj.scale = size
    finish(obj, name, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj

def rod(name, start, end, radius, material):
    a, b = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=radius, depth=(b-a).length, location=(a+b)/2)
    obj = bpy.context.object
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return finish(obj, name, material)

assets = []
def export_asset(asset_id, ceiling):
    # Blender -Y is forward; the glTF Y-up conversion makes this runtime +Z.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    mesh = bpy.context.object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mesh.name = asset_id
    scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    mesh.data.calc_loop_triangles()
    triangles = len(mesh.data.loop_triangles)
    bounds = [[min(v.co[i] for v in mesh.data.vertices), max(v.co[i] for v in mesh.data.vertices)] for i in range(3)]
    if triangles > ceiling:
        raise ValueError(f'{asset_id}: {triangles} > {ceiling} triangles')
    path = OUT / f'{asset_id}.glb'
    temporary = OUT / f'{asset_id}-{uuid.uuid4().hex}.glb'
    bpy.ops.export_scene.gltf(filepath=str(temporary), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_animations=False,
                              export_extras=True, export_texcoords=False, export_cameras=False, export_lights=False)
    temporary.replace(path)
    assets.append({'id': asset_id, 'triangles': triangles, 'triangleCeiling': ceiling,
                   'blenderBounds': bounds, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                   'bytes': path.stat().st_size, 'status': 'CALIBRATION_STATIC',
                   'clips': [], 'runtimeIntegrated': False, 'object': mesh.name})
    mesh.hide_set(True)
    parts.clear()

box('stone-body', (0, 0, -.09), (.97, .97, .18), 'obsidian', .035)
box('tile-edge-west', (-.47, 0, .004), (.012, .94, .008), 'bronze')
box('tile-edge-north', (0, -.47, .004), (.94, .012, .008), 'bronze')
export_asset('tile-floor', 120)

box('wall-plinth', (0, 0, .04), (.965, .965, .08), 'rubber', .025)
box('wall-stone', (0, 0, .38), (.95, .95, .72), 'edge', .055)
export_asset('tile-wall', 120)

exec((Path(__file__).parent/'hero_reference.py').read_text(encoding='utf-8'))

sphere('bug-shell', (0, .07, .3), (.23, .29, .16), 'red')
box('bug-spine', (0, .06, .455), (.032, .34, .018), 'bronze')
sphere('bug-head', (0, -.23, .25), (.16, .13, .13), 'obsidian')
for side in (-1, 1):
    sphere(f'bug-eye-{side}', (side*.085, -.34, .29), (.037, .026, .037), 'eye')
    for i, y in enumerate((-.13, .06, .23)):
        rod(f'bug-leg-{side}-{i}', (side*.15, y, .26), (side*.34, y+.055, .19), .024, 'bronze')
        rod(f'bug-foot-{side}-{i}', (side*.34, y+.055, .19), (side*.39, y-.04, .035), .023, 'rubber')
export_asset('enemy-bug', 3000)

# Full classic monster roster, authored as distinct silhouettes in the chosen toy-like material style.
sphere('fire-core',(0,0,.3),(.25,.25,.27),'yellow')
for i in range(7):
    a=i*math.tau/7
    bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=.11,radius2=0,depth=.44,location=(math.cos(a)*.16,math.sin(a)*.16,.48))
    finish(bpy.context.object,'flame-tongue','orange')
export_asset('enemy-fireball',4000)
sphere('bounce-ball',(0,0,.29),(.28,.28,.28),'purple')
bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=8,major_radius=.271,minor_radius=.016,location=(0,0,.29))
finish(bpy.context.object,'ball-band','bronze')
export_asset('enemy-ball',1500)
for side in (-1,1):
    box('tank-track',(side*.25,0,.13),(.13,.7,.22),'rubber',.04)
    for y in (-.23,0,.23):sphere('wheel',(side*.3,y,.14),(.026,.079,.079),'bronze')
box('tank-hull',(0,0,.27),(.44,.58,.23),'blue',.04)
box('tank-turret',(0,0,.44),(.27,.3,.18),'blue',.045)
rod('tank-barrel',(0,-.1,.45),(0,-.46,.45),.05,'bronze')
export_asset('enemy-tank',4000)
sphere('glider-body',(0,0,.27),(.16,.3,.13),'blue')
for side in (-1,1):
    wing=box('glider-wing',(side*.24,.01,.24),(.43,.26,.045),'bronze',.02)
    wing.rotation_euler.z=side*.25
    sphere('glider-eye',(side*.06,-.245,.29),(.028,.03,.04),'rubber')
box('glider-tail',(0,.26,.34),(.05,.15,.2),'blue',.015)
export_asset('enemy-glider',2200)
sphere('teeth-bottom',(0,0,.15),(.3,.28,.11),'red')
sphere('teeth-top',(0,.025,.44),(.3,.26,.1),'red')
for side in (-1,1):
    for i in range(5):
        a=math.pi*(.12+i*.19)
        tooth=box('ivory-tooth',(math.cos(a)*.235,-math.sin(a)*.22,.22 if side<0 else .375),(.09,.095,.13),'eye',.012)
export_asset('enemy-teeth',2400)
box('walker-core',(0,0,.32),(.36,.36,.35),'bronze',.04)
for side in (-1,1):
    for y in (-.17,.17):
        rod('walker-leg',(side*.16,y,.34),(side*.36,y*1.5,.08),.038,'rubber')
        sphere('walker-foot',(side*.36,y*1.5,.055),(.07,.08,.055),'bronze')
    sphere('walker-lens',(side*.085,-.2,.36),(.052,.035,.064),'blue')
export_asset('enemy-walker',3800)
sphere('blob-body',(0,0,.24),(.3,.31,.24),'green')
for i in range(5):
    a=i*math.tau/5
    sphere('blob-foot',(math.cos(a)*.21,math.sin(a)*.21,.095),(.14,.14,.095),'green')
export_asset('enemy-blob',3000)
sphere('paramecium-body',(0,0,.23),(.20,.34,.19),'pink')
sphere('paramecium-nucleus',(0,-.01,.405),(.08,.13,.035),'purple')
for side in (-1,1):
    for i in range(7):
        y=(i-3)*.083
        rod('cilia',(side*.16,y,.22),(side*(.28-abs(y)*.18),y+.045,.13),.015,'purple')
export_asset('enemy-paramecium',2500)

for index,color in enumerate(('blue','orange','blue','green')):
    for side in (-1,1):
        box('boot-sole',(side*.14,-.07,.065),(.21,.45,.09),'rubber',.025)
        sphere('boot-toe',(side*.14,-.18,.12),(.105,.15,.075),color)
        box('boot-shaft',(side*.14,.05,.23),(.19,.22,.32),color,.03)
        box('boot-cuff',(side*.14,.05,.395),(.21,.24,.045),'bronze',.015)
        if index==2:box('skate-blade',(side*.14,-.06,.025),(.025,.44,.035),'bronze')
    export_asset('item-boot-'+str(index),2500)

for color in ('blue', 'red', 'green', 'yellow'):
    box('lock-body', (0, 0, .3), (.8, .8, .6), 'edge', .04)
    box('lock-rim', (0, 0, .62), (.65, .65, .075), 'bronze', .025)
    box('lock-color', (0, 0, .666), (.54, .54, .025), color, .02)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=.105, depth=.012, location=(0, .09, .685))
    finish(bpy.context.object, 'keyhole-round', 'rubber')
    box('keyhole-slot', (0, -.065, .686), (.105, .22, .014), 'rubber')
    export_asset('door-'+color, 1000)
    bpy.ops.mesh.primitive_torus_add(major_segments=24, minor_segments=8, major_radius=.135, minor_radius=.033, location=(0, .16, .12))
    finish(bpy.context.object, 'key-ring', color)
    rod('key-stem', (0, .03, .12), (0, -.28, .12), .032, color)
    for y in (-.2, -.28):
        box(f'key-tooth-{y}', (.065, y, .12), (.15, .04, .065), color, .009)
    export_asset('key-'+color, 600)

box('chip-body', (0, 0, .15), (.34, .54, .12), 'rubber', .025)
box('chip-label', (0, 0, .217), (.22, .38, .015), 'edge')
for side in (-1, 1):
    for pin in range(6):
        box(f'pin-{side}-{pin}', (side*.225, (pin-2.5)*.078, .13), (.15, .036, .034), 'bronze')
export_asset('item-chip', 600)

exec((Path(__file__).parent/'terrain_reference.py').read_text(encoding='utf-8'))

# Contact sheet camera: everything shown in a shared, reproducible lighting setup.
for index, asset in enumerate(assets):
    obj = bpy.data.objects[asset['object']]
    obj.hide_set(False)
    obj.location.x = (index % 8 - 3.5) * 1.45
    obj.location.y = (index // 8) * 1.65
    bpy.ops.object.text_add(location=(obj.location.x, obj.location.y-.66, .02))
    label = bpy.context.object
    label.name = 'label-' + asset['id']
    label.data.body = asset['id']
    label.data.align_x = 'CENTER'
    label.data.size = .115
    label.data.materials.append(materials['bronze'])
box('presentation-ground', (0, 5, -.22), (15, 17, .1), 'rubber')
for name, location, energy, color, size in [
    ('warm-key', (-3, -4, 7), 850, (1, .82, .6), 5),
    ('cool-fill', (4, 1, 5), 650, (.53, .74, 1), 4),
    ('rim', (0, 5, 5), 1000, (1, .73, .4), 3),
]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.color = color
    light.data.shape = 'DISK'
    light.data.size = size
    light.rotation_euler = (Vector((0, .6, 0))-light.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.camera_add(location=(4, -8, 12))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 5, .25))-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 17
scene.camera = camera
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'calibration.blend'))
scene.render.filepath = str(OUT/'contact-sheet.png')
bpy.ops.render.render(write_still=True)
metadata = {'version': 1, 'blender': bpy.app.version_string, 'source': 'Original procedural recipes for Shadow Circuit',
            'coordinates': 'Blender -Y forward / +Z up; glTF +Z forward / +Y up; feet at origin',
            'scope': 'Static calibration only. Animation, runtime orientation and gameplay-scale review are pending.',
            'assets': assets}
(OUT/'manifest.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'output': str(OUT), 'assets': len(assets), 'bytes': sum(a['bytes'] for a in assets)}))
