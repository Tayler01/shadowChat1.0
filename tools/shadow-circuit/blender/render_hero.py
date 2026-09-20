import bpy
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[3]
folder=root/'assets-source/shadow-circuit/circuit-kit-v2'
bpy.ops.wm.open_mainfile(filepath=str(folder/'calibration.blend'))
scene=bpy.context.scene
for obj in scene.objects:
    obj.hide_render=obj.type not in {'LIGHT','CAMERA'} and obj.name not in {'hero-explorer','presentation-ground'}
hero=bpy.data.objects['hero-explorer'];hero.location=(0,0,0)
ground=bpy.data.objects['presentation-ground'];ground.location=(0,0,-.035)
scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.cycles.samples=48
scene.camera.data.ortho_scale=1.52
for obj in scene.objects:
    if obj.type=='LIGHT':obj.data.color=(1,1,1)
for name,position in [('hero-three-quarter',(1.6,-3,1.9)),('hero-front',(0,-3,1.15))]:
    scene.camera.location=position
    scene.camera.rotation_euler=(Vector((0,0,.57))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(folder/(name+'.png'))
    bpy.ops.render.render(write_still=True)
