"""Reference-led mobile study: original meshes and Cycles-baked room lighting.
Run Blender --background --python-exit-code 1 --python ArtSource/create_study.py.
Room and desk use two shared baked atlases, with fully three-dimensional geometry.
"""
import bpy, math, random, os, shutil
import sys
from pathlib import Path
from mathutils import Vector, Matrix

random.seed(1587)
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'Assets/Resources/Models'
TEX=ROOT/'Assets/Resources/Textures'
SOURCE=ROOT/'ArtSource/Textures'
STAGING=ROOT/'Temp/StudyExports'
STAGING.mkdir(parents=True,exist_ok=True)

def publish_copy(source,destination):
    if destination.exists() and source.read_bytes()==destination.read_bytes(): return
    pending=STAGING/destination.name
    shutil.copy2(source,pending)
    os.replace(pending,destination)

def export_model(name,**options):
    # Unity can map the old FBX while an Editor preview is open on Windows.
    # Complete the new file outside Assets before replacing the mapped name.
    pending=STAGING/(name+'.fbx')
    bpy.ops.export_scene.fbx(filepath=str(pending),use_selection=True,object_types={'MESH'},axis_forward='-Z',axis_up='Y',apply_unit_scale=True,bake_anim=False,**options)
    os.replace(pending,OUT/(name+'.fbx'))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=24
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='OPTIX'
devices=prefs.get_devices_for_type('OPTIX')
for device in devices: device.use=device.type=='OPTIX'
if any(device.use for device in devices): scene.cycles.device='GPU'
scene.cycles.use_denoising=True
scene.cycles.max_bounces=5
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.16,.23,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.12
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
groups={'StudyArchitecture':[], 'StudyFurnishings':[], 'StudyBindings':[], 'StudyMetals':[]}
group='StudyArchitecture'

offset_x=0
folio_index=None
def p(v): return (v[0]+offset_x,-v[2],v[1])
def material(name,color,rough=.5,texture=None,metal=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    n=m.node_tree.nodes; l=m.node_tree.links; bs=n.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    coord=n.new('ShaderNodeTexCoord')
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=34
    l.new(coord.outputs['Generated'],noise.inputs['Vector'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.13;bump.inputs['Distance'].default_value=.012
    l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal'])
    if texture:
        image=n.new('ShaderNodeTexImage');image.image=bpy.data.images.load(str(texture),check_existing=True)
        if name=='Engraved map':
            uv=n.new('ShaderNodeUVMap');uv.uv_map='UVMap';l.new(uv.outputs[0],image.inputs['Vector'])
        else:
            mapping=n.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs[3].default_value=7
            l.new(coord.outputs['Generated'],mapping.inputs[0])
            image.projection='BOX';image.projection_blend=.12;l.new(mapping.outputs[0],image.inputs['Vector'])
        mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*color,1)
        l.new(image.outputs['Color'],mix.inputs[1]);l.new(mix.outputs[0],bs.inputs['Base Color'])
    return m

wood=material('Carved dark walnut',(.19,.155,.115),.32,SOURCE/'OakColor.jpg')
woodedge=material('Worn walnut edges',(.30,.24,.17),.3,SOURCE/'OakColor.jpg')
stone=material('Blackened hearth stone',(.27,.24,.20),.8,SOURCE/'HearthStoneColor.jpg')
brass=material('Old candle brass',(.38,.23,.075),.3,metal=.35)
iron=material('Wrought iron',(.017,.014,.012),.65)
paper=material('Aged page edges',(.37,.28,.15),.8)
wax=material('Honey beeswax',(.62,.47,.26),.46)
mapmat=material('Engraved map',(.60,.43,.23),.86,ROOT/'ArtSource/MercatorWorldMap.jpg')
leathers=[material('Leather binding %d'%i,c,.48) for i,c in enumerate([(.035,.022,.013),(.10,.027,.015),(.028,.047,.038),(.105,.061,.025),(.035,.025,.052),(.15,.075,.025)])]
bindings=material('Photographic leather tooling',(1,1,1),.45)
bindingImage=bindings.node_tree.nodes.new('ShaderNodeTexImage');bindingImage.image=bpy.data.images.load(str(TEX/'BookSpines.png'))
bindings.node_tree.links.new(bindingImage.outputs['Color'],bindings.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

def binding_face(x,y,z,w,h,index):
    global group
    old=group;group='StudyBindings'
    mesh=bpy.data.meshes.new('Tooled leather spine')
    # Wrap the existing atlas over a rounded back with raised sewing supports.
    # This replaces the separate metal bands, keeping one shared draw surface.
    columns=6
    rows=[0,.025,.20,.215,.23,.39,.405,.42,.78,.795,.81,.975,1]
    vertices=[];coordinates=[];faces=[]
    for v in rows:
        rib=max(max(0,1-abs(v-center)/.018) for center in [.215,.405,.795])*.014
        for column in range(columns+1):
            u=column/columns
            arch=(1-(2*u-1)**2)*min(.07,w*.24)
            vertices.append(p((x+(u-.5)*w,y+(v-.5)*h,z-arch-rib)))
            coordinates.append(((index+u)/8,v))
    stride=columns+1
    for row in range(len(rows)-1):
        for column in range(columns):
            a=row*stride+column
            faces.append((a+stride,a+stride+1,a+1,a))
    mesh.from_pydata(vertices,[],faces)
    mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:mesh.uv_layers.active.data[loop.index].uv=coordinates[loop.vertex_index]
    for face in mesh.polygons:face.use_smooth=True
    obj=bpy.data.objects.new('Tooled leather spine',mesh);bpy.context.collection.objects.link(obj);register(obj,'Tooled leather spine',bindings)
    group=old

def register(o,name,mat):
    o.name=name;o.data.materials.append(mat);groups['StudyMetals' if mat==brass else group].append(o)
    if folio_index is not None:o['folio_index']=folio_index
    return o
def box(name,xyz,size,mat,bevel=.025):
    sx,sy,sz=size[0]/2,size[2]/2,size[1]/2
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata([(-sx,-sy,-sz),(sx,-sy,-sz),(sx,sy,-sz),(-sx,sy,-sz),(-sx,-sy,sz),(sx,-sy,sz),(sx,sy,sz),(-sx,sy,sz)],[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.location=p(xyz)
    mesh.uv_layers.new(name='UVMap')
    register(o,name,mat)
    if bevel:
        b=o.modifiers.new('Eased edges','BEVEL');b.width=bevel;b.segments=2
        o.modifiers.new('Face normals','WEIGHTED_NORMAL')
    return o
def lathe(name,xyz,profile,mat,segments=24):
    verts=[]; faces=[]
    for radius,h in profile:
        verts.extend([(radius*math.cos(i*math.tau/segments),radius*math.sin(i*math.tau/segments),h) for i in range(segments)])
    for j in range(len(profile)-1):
        for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.location=p(xyz)
    for f in mesh.polygons:f.use_smooth=True
    return register(o,name,mat)
def torus(name,xyz,radius,tube,mat,rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=40,minor_segments=6,major_radius=radius,minor_radius=tube,location=p(xyz))
    o=bpy.context.object
    if rotation:o.rotation_euler=rotation
    for face in o.data.polygons:face.use_smooth=True
    return register(o,name,mat)
def point(name,xyz,power,color,radius):
    data=bpy.data.lights.new(name,'POINT');data.energy=power;data.color=color;data.shadow_soft_size=radius
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=p(xyz)
def area(name,xyz,target,power,color,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=p(xyz);o.rotation_euler=(Vector(p(target))-o.location).to_track_quat('-Z','Y').to_euler()
def frame(name,xyz,width,height,mat):
    x,y,z=xyz
    for depth,inset,t in [(0,0,.16),(-.08,.19,.06),(-.1,.29,.04)]:
        for side in [-1,1]:
            box(name,(x+side*(width/2-inset),y,z+depth),(t,height-2*inset,.15),mat,.025)
            box(name,(x,y+side*(height/2-inset),z+depth),(width-2*inset,t,.15),mat,.025)
def flat_map(name,xyz,width,height,horizontal=False):
    bpy.ops.mesh.primitive_plane_add(size=2,location=p(xyz));o=bpy.context.object
    if not horizontal:o.rotation_euler=(-math.pi/2,0,0)
    o.scale=(width/2,height/2,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if not horizontal:
        for value in o.data.uv_layers.active.data:value.uv=(1-value.uv.x,1-value.uv.y)
    return register(o,name,mapmat)

# Close, tall panelled walls fill the player's perspective with layered detail.
box('Walnut room back',(0,3.5,15),(34,17,.3),wood,0)
for x in range(-16,17,2):
    box('Recessed wainscot',(x,-2.6,14.72),(1.82,3.3,.13),wood)
    frame('Raised panel moulding',(x,-2.6,14.56),1.7,3.1,woodedge)
for y in [-4.5,-.7,10.6,11.1]:box('Continuous carved cornice',(0,y,14.7),(34,.18,.32),woodedge)
for side in [-1,1]:
    box('Side walnut wall',(side*17,3.5,0),(.35,17,31),wood,0)
    for z in range(-14,15,3):
        box('Wall pilaster',(side*16.7,3,z),(.3,15,.27),woodedge)
box('Rear wall',(0,3.5,-16),(34,17,.3),wood,0)
box('Ceiling',(0,12.2,0),(34,.25,32),wood,0)
for x in range(-15,16,5):box('Ceiling beam',(x,11.8,0),(.4,.7,32),woodedge)
for x in range(-8,9):box('Wide floorboards',(x*2,-4.7,0),(1.985,.15,32),wood,0)

def library_volume(px,base,z,w,h,dep,leather,index):
    before=set(bpy.data.objects)
    box('Bound vellum pages',(px,base+h/2,z-.05),(w-.03,h-.06,dep-.08),paper,.008)
    for side in [-1,1]:box('Leather book board',(px+side*w/2,base+h/2,z-.05),(.028,h,dep),leather,.008)
    box('Rounded leather spine',(px,base+h/2,z-.05-dep/2),(w,.98*h,.055),leather,.018)
    binding_face(px,base+h/2,z-.082-dep/2,w,h,index)
    return set(bpy.data.objects)-before

def bookshelf(x,z):
    box('Dark bookcase backing',(x,3.1,z+.5),(4.55,14.8,.18),wood,0)
    for side in [-1,1]:
        box('Fluted bookcase pillar',(x+side*2.4,3.1,z),(.32,15.2,1.25),woodedge)
        for dx in [-.065,.065]:box('Pillar flute',(x+side*2.4+dx,3.1,z-.66),(.023,14,.02),wood)
    for shelf in range(9):
        y=-4.4+shelf*1.78
        box('Shelf cornice',(x,y,z),(5.1,.17,1.5),woodedge)
        if shelf==8:continue
        bpos=-2.15
        # A few low stacks interrupt the upright rows without adding materials.
        if shelf%3==1:
            stack_base=y+.085
            for number in range(3):
                w=random.uniform(.16,.24);h=random.uniform(1.04,1.31);dep=random.uniform(.67,.86)
                px=x+bpos+h/2+random.uniform(-.025,.025)
                volumes=library_volume(px,stack_base,z,w,h,dep,random.choice(leathers),random.randrange(8))
                old=Vector(p((px,stack_base+h/2,z-.05)))
                center=Vector(p((px,stack_base+(w+.028)/2,z-.05)))
                bpy.context.view_layer.update()
                transform=Matrix.Translation(center) @ Matrix.Rotation(math.pi/2,4,'Y') @ Matrix.Translation(-old)
                for obj in volumes:obj.matrix_world=transform @ obj.matrix_world
                stack_base+=w+.028
            bpos+=1.43
        while bpos<2.05:
            w=random.uniform(.14,.46);h=random.uniform(.83,1.52);dep=random.uniform(.57,.95)
            w=min(w,2.15-bpos-.035)
            if w<.12:break
            leather=random.choice(leathers);px=x+bpos+w/2
            lean=random.uniform(-.06,.06)
            base=y+.085+abs(math.sin(lean))*(w+.028)/2
            volumes=library_volume(px,base,z,w,h,dep,leather,random.randrange(8))
            # Rotate each complete volume together: page block, boards, tooling
            # and bands. A slight lean and uneven setback break the modern grid.
            pivot=Vector(p((px,base,z-.05)))
            bpy.context.view_layer.update()
            matrix=Matrix.Translation(pivot) @ Matrix.Rotation(lean,4,'Y') @ Matrix.Translation(-pivot)
            for obj in volumes:
                obj.matrix_world=matrix @ obj.matrix_world
            bpos+=w+random.uniform(.035,.13)
    for y in [-4.4,10.0,10.25]:box('Bookcase pediment',(x,y,z),(5.3,.2,1.65),woodedge)
# Leave a proper window bay between the library and framed map. Both cases
# still clear the side wall, and retain their full shelf/book proportions.
bookshelf(-13.65,14);bookshelf(-8.15,14)
print('STUDY_BOOKCASES_MODELED',flush=True)

# A deep opening reads from the room sweep: the fire sits behind the projecting
# stone throat, while the mantel forms a continuous chimney breast above it.
offset_x=3.5
box('Soot behind the fire',(7,-1.0,14.55),(5.6,6.4,.2),stone,0)
hearth_rng=random.Random(6814)
for row in range(9):
    for column in range(5):
        x=4.87+column*1.07+(row%2)*.13+hearth_rng.uniform(-.035,.035)
        y=-4.05+row*.65+hearth_rng.uniform(-.025,.025)
        depth=hearth_rng.uniform(.14,.23)
        box('Uneven firebox courses',(x,y,14.35-depth*.5),(1.00,hearth_rng.uniform(.56,.61),depth),stone,.025)
box('Hearth slab',(7,-4.4,12.8),(7,.45,3.8),stone)
for side in [-1,1]:
    jamb_x=7+side*3.15
    box('Deep stone fireplace jamb',(jamb_x,-1.4,13.35),(.70,6.3,2.05),stone,.055)
    for y in [-4.1,1.2]:box('Worn jamb capital',(jamb_x,y,12.9),(1.04,.35,2.55),stone,.045)
    for flute in [-.18,0,.18]:
        box('Pillar carved flute',(7+side*3.42+flute,3.45,12.25),(.035,3.55,.045),wood,.012)
    box('Carved mantel pillar',(7+side*3.4,3.4,12.45),(.49,4.1,.65),woodedge)
    for y in [2.0,5.5]:box('Pillar collar',(7+side*3.4,y,12.42),(.66,.16,.8),woodedge)
box('Mantel chimney breast',(7,3.77,13.47),(7.25,3.58,1.48),stone,.08)
for y,w,d,z in [(1.65,7.55,2.75,12.95),(2.0,8.05,2.92,12.9),(5.7,8.05,2.15,13.0)]:
    box('Projecting mantel cornice',(7,y,z),(w,.25,d),woodedge,.055)
frame('Hearth overmantel',(7,3.9,12.62),5.2,2.8,woodedge)
# A low relief compass rose gives the overmantel a finished decorative purpose.
box('Carved overmantel field',(7,3.9,12.53),(4.40,2.06,.08),wood,.025)
torus('Overmantel compass ring',(7,3.9,12.42),.68,.032,brass,(math.pi/2,0,0))
for angle in range(8):
    a=angle*math.tau/8
    ornament=box('Overmantel compass ray',(7+.49*math.sin(a),3.9+.49*math.cos(a),12.38),(.075,.45,.035),brass,.012)
    # The vertical wall is Blender's X/Z plane after p() maps study coordinates.
    ornament.rotation_euler=(0,a,0)
lathe('Overmantel compass boss',(7,3.9,12.36),[(0,0),(.12,.025),(.08,.06),(0,.07)],brass,12).rotation_euler=(math.pi/2,0,0)
# Layered carved rosettes and scrolls break up the broad mantel face.
for x in [4.6,5.8,7,8.2,9.4]:
    for radius in [.18,.24]:torus('Carved mantel rosette',(x,1.9,11.39),radius,.032,woodedge,(math.pi/2,0,0))
for side in [-1,1]:
    for j in range(5):torus('Overmantel scrolling relief',(7+side*(.9+j*.33),3.7+math.sin(j*.7)*.35,12.36),.20-j*.018,.028,woodedge,(math.pi/2,0,0))
for z in [12.6,13.2,13.8]:
    o=lathe('Charred oak log',(7,-3.8,z),[(0,0),(.24,0),(.24,3.6),(0,3.6)],iron,12);o.rotation_euler=(0,math.pi/2,0);o.location.x-=1.8
for x in [4.8,5.8,6.8,7.8,8.8]:
    lathe('Hearth grate bar',(x,-4.1,12.1),[(.045,0),(.045,1.6),(.09,1.65),(.045,1.75)],iron,12)
point('Firelight',(7,-2.1,12.1),1200,(1,.43,.17),.7)
area('Hearth bounce',(7,-.8,11.7),(0,0,0),700,(1,.56,.30),2)
offset_x=0

group='StudyFurnishings'
flat_map('Mercator wall chart',(1.6,4.25,14.5),7.1,5.085)
frame('Map carved frame',(1.6,4.25,14.42),7.7,5.685,woodedge)
# Window and pale dusk remain behind and between the tall shelves.
# The live window supplies the dusk sky and exterior branches. Leave this bay
# free of an opaque baked glass slab so their shallow depth remains visible.
frame('Walnut window casing',(-3.9,4.15,14.02),2.9,10.1,woodedge)
for x in [-5.2,-3.9,-2.6]:box('Window mullion',(x,4.15,14.12),(.08,9.7,.15),iron)
for y in [-.7,1,3.8,6.4,9]:box('Window crossbar',(-3.9,y,14.10),(2.6,.07,.17),iron)
area('Dusk through window',(-3.9,5.3,13),(0,0,-1),1800,(.36,.52,.85),4)

# Broad writing table leaves room for foreground props around the checkers board.
for i in range(-6,7):box('Writing table plank',(i*1.7,-1.12,0),(1.69,.33,15),woodedge,.025)
for side in [-1,1]:
    box('Table carved apron',(0,-1.9,side*6.75),(21,.95,.32),wood)
    for x in [-9,9]:
        lathe('Turned table leg',(x,-4.6,side*6.2),[(.45,0),(.50,.13),(.38,.3),(.27,.9),(.46,1.2),(.5,1.5),(.35,1.8),(.28,2.5),(.5,3),(.5,3.5)],woodedge)
    for x in range(-9,10,3):frame('Apron inset',(x,-1.9,side*6.96),2.5,.72,woodedge)

def candle(x,y,z,h):
    lathe('Turned brass candlestick',(x,y,z),[(0,0),(.38,0),(.39,.06),(.32,.12),(.23,.15),(.10,.22),(.085,.5),(.14,.57),(.08,.65),(.08,.94),(.23,1),(.24,1.07),(.10,1.09)],brass,32)
    lathe('Hand dipped wax',(x,y+1.08,z),[(0,0),(.115,0),(.13,h*.2),(.12,h*.6),(.13,h-.06),(.10,h),(.055,h-.07),(0,h-.07)],wax,24)
    for i in range(5):
        a=i*1.7;length=random.uniform(.12,.5)
        lathe('Cooled wax drip',(x+.12*math.cos(a),y+1.08+h-length,z+.12*math.sin(a)),[(0,0),(.026,.025),(.022,length),(0,length+.03)],wax,8)
    point('Candle pool',(x,y+h+1.25,z),100,(1,.59,.28),.07)
    lathe('Black wick',(x,y+h+1.02,z),[(.016,0),(.012,.14)],iron,8)
    emit=material('Candle flame',(.9,.45,.08),.5);bs=emit.node_tree.nodes.get('Principled BSDF');bs.inputs['Emission Color'].default_value=(1,.47,.10,1);bs.inputs['Emission Strength'].default_value=5
    # Visible flames are animated at runtime; these lights still contribute to the bake.
candle(-7.6,-.955,-3.5,1.6);candle(7.1,-.955,4.5,1.2);candle(7.9,-.955,-5.8,.85)
candle(8,2.13,13.1,1.6);candle(13.3,2.13,13.1,1.15)

for i in range(4):
    folio_index=i
    x=-7.8;y=-.7+i*.33;z=3.2
    box('Folio page block',(x,y,z),(2.8,.25,2),paper)
    for side in [-1,1]:box('Embossed folio cover',(x,y+side*.16,z),(2.95,.06,2.12),leathers[i])
    box('Stacked folio spine',(x,y,z-1.07),(2.97,.3,.10),leathers[i])
    for bx in [-1.25,1.25]:box('Folio brass corner',(x+bx,y+.2,z-.93),(.2,.04,.2),brass)
folio_index=None
flat_map('Desk parchment',(-7.1,-.953,-5.6),3.6,2.8,True)
flat_map('Folded charts',(7.3,-.953,1.5),3.9,2.8,True)
lathe('Ink bottle',(-7.1,-.955,-4.0),[(0,0),(.22,0),(.25,.1),(.24,.4),(.13,.48),(.13,.62),(.10,.63)],iron)
lathe('Metal goblet',(8.2,-.955,-2.7),[(0,0),(.33,0),(.3,.07),(.08,.2),(.07,.6),(.16,.7),(.32,.85),(.38,1.25),(.35,1.5),(.32,1.5),(.30,1.3)],brass,32)
# An armillary sphere adds distinct curved metalwork to the study silhouette.
lathe('Armillary pedestal',(7.1,-.955,5.8),[(0,0),(.56,0),(.6,.1),(.38,.25),(.17,.35),(.12,1.1),(.25,1.2)],brass)
for angle in [0,.65,1.3,2.0]:torus('Armillary meridian',(7.1,1.2,5.8),1.05,.026,brass,(math.pi/2,angle,.35))
torus('Armillary equator',(7.1,1.2,5.8),1.10,.05,brass,(.25,0,0))
# Broad, soft illumination on the playing desk. Warm pools stay local.
area('Desk softbox',(1,7,-3),(0,-1,0),2400,(1,.79,.54),5)
area('Room reflected fill',(-8,7,-3),(-5,3,13),800,(.64,.70,.82),8)

# Bake physically calculated light and ambient contact into shared mesh atlases.
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'ArtSource'))
from study_details import enrich_study
enrich_study(globals())
bpy.ops.object.select_all(action='DESELECT')
joined=[]
for name,objects in groups.items():
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join();obj=bpy.context.object;obj.name=name
    print('STUDY_JOINED',name,len(obj.data.polygons),flush=True)
    if name not in ['StudyArchitecture','StudyFurnishings']:
        if name!='StudyWine':
            colors=obj.data.color_attributes
            tint=colors.get('SurfaceTint')
            if tint:
                ao=colors.new(name='BakedAO',type='FLOAT_COLOR',domain='CORNER')
                colors.active_color_index=len(colors)-1
                scene.render.bake.target='VERTEX_COLORS'
                bpy.ops.object.bake(type='AO')
                # Adding a color layer and baking can reallocate Blender's RNA
                # storage. Resolve both layers again before accessing their data.
                colors=obj.data.color_attributes
                tint=colors['SurfaceTint']
                ao=colors['BakedAO']
                for i,value in enumerate(tint.data):
                    shade=.35+.65*max(0,min(1,ao.data[i].color[0]))
                    value.color=(value.color[0]*shade,value.color[1]*shade,value.color[2]*shade,value.color[3])
                colors.remove(ao);colors.active_color_index=0;colors.render_color_index=0
                scene.render.bake.target='IMAGE_TEXTURES'
        # One submesh/material per shared surface keeps the mobile batch count bounded.
        first_material=obj.data.materials[0]
        for face in obj.data.polygons:face.material_index=0
        obj.data.materials.clear();obj.data.materials.append(first_material)
        export_model(name,colors_type='LINEAR')
        obj.select_set(False);continue
    obj.data.uv_layers.new(name='BakedUV');obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.003,area_weight=.5)
    bpy.ops.object.mode_set(mode='OBJECT');obj.select_set(False);joined.append(obj)
for obj in joined:
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    image=bpy.data.images.new(obj.name+'Lightmap',width=2048,height=2048,alpha=False)
    for mat in obj.data.materials:
        n=mat.node_tree.nodes.new('ShaderNodeTexImage');n.image=image;mat.node_tree.nodes.active=n
    scene.render.bake.use_pass_direct=True;scene.render.bake.use_pass_indirect=True;scene.render.bake.use_pass_color=True
    scene.render.bake.margin=4;scene.render.bake.use_pass_glossy=False
    bpy.ops.object.bake(type='COMBINED')
    pending=STAGING/(obj.name+'Lightmap.jpg')
    image.filepath_raw=str(pending);image.file_format='JPEG';image.save()
    os.replace(pending,TEX/pending.name);image.filepath_raw=str(TEX/pending.name)
    # Runtime keeps baked radiance in UV0 and physical-scale wood grain in UV1.
    runtime=bpy.data.materials.new(obj.name);runtime.use_nodes=True
    tex=runtime.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
    runtime.node_tree.links.new(tex.outputs['Color'],runtime.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    obj.data.materials.clear();obj.data.materials.append(runtime)
    baked_uv=[tuple(value.uv) for value in obj.data.uv_layers['BakedUV'].data]
    detail_uv=[tuple(value.uv) for value in obj.data.uv_layers['SurfaceDetail'].data]
    while obj.data.uv_layers:obj.data.uv_layers.remove(obj.data.uv_layers[0])
    for name,coordinates in [('UVMap',baked_uv),('SurfaceDetail',detail_uv)]:
        layer=obj.data.uv_layers.new(name=name)
        for value,coordinate in zip(layer.data,coordinates):value.uv=coordinate
    obj.data.uv_layers.active_index=0
    export_model(obj.name,colors_type='LINEAR')
    obj.select_set(False)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'ArtSource/MedievalStudy.blend'))
print('STUDY_BAKE_READY',flush=True)
