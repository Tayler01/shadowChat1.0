"""Complete beveled terrain kit; runs in the calibration builder's export context."""

def disc(name, center, radius, depth, material):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth, location=center)
    return finish(bpy.context.object,name,material)

def frame(name, height=.055, material='bronze', width=.94):
    for side in (-1,1):
        box(name,(side*(width/2-.035),0,height),(.065,width,.065),material,.014)
        box(name,(0,side*(width/2-.035),height),(width-.12,.065,.065),material,.014)

def plate(name, material='edge'):
    box(name,(0,0,.045),(.96,.96,.09),material,.025)

# The exit is an upright blue square spiral with a machined surround, like the reference.
box('exit-foot',(0,.04,.05),(.94,.44,.10),'edge',.035)
box('exit-metal',(0,.11,.49),(.94,.14,.94),'bronze',.035)
box('exit-blue',(0,.021,.49),(.85,.055,.85),'portal',.018)
points=[(-.36,.0,.13),(-.36,.0,.85),(.36,.0,.85),(.36,.0,.13),(-.25,.0,.13),(-.25,.0,.74),(.25,.0,.74),(.25,.0,.24),(-.14,.0,.24),(-.14,.0,.63),(.14,.0,.63),(.14,.0,.35),(-.03,.0,.35),(-.03,.0,.52),(.035,.0,.52)]
for a,b in zip(points,points[1:]):
    box('luminous-square-spiral',tuple((x+y)/2 for x,y in zip(a,b)),(max(.026,abs(b[0]-a[0])+.024),.018,max(.026,abs(b[2]-a[2])+.024)),'light-blue',.004)
export_asset('terrain-exit',2200)

plate('socket-base');frame('socket-rim',.115)
box('socket-recess',(0,0,.106),(.45,.64,.03),'rubber',.025)
for side in (-1,1):
    box('socket-rail',(side*.31,0,.13),(.10,.68,.06),'yellow',.012)
    for y in (-.24,-.12,0,.12,.24):box('socket-contact',(side*.245,y,.145),(.13,.046,.027),'bronze',.007)
box('socket-interior',(0,0,.124),(.26,.44,.014),'edge',.012)
export_asset('terrain-socket',2000)

plate('teleport-pad','portal');frame('teleport-frame',.10)
for size in (.66,.44,.22):frame('teleport-square',.10,'light-blue',size)
export_asset('terrain-teleport',1800)

plate('water-basin','water')
for j,y in enumerate((-.32,-.11,.12,.33)):
    curve_mesh('water-ripple',[(x,y+.025*math.sin(x*15+j),.095) for x in (-.42,-.28,-.14,0,.14,.28,.42)],.009,'blue')
export_asset('terrain-water',2200)

def ice_base():
    plate('ice-tile','blue')
    for i in range(3):
        curve_mesh('ice-crack',[(-.4+i*.27,-.43,.097),(-.26+i*.25,-.05,.097),(-.35+i*.29,.35,.097)],.009,'light-blue')
def edges(directions,material='edge'):
    for d in directions:
        # Blender -Y becomes runtime +Z, so north is Blender +Y.
        box('boundary',((.455 if d==1 else -.455 if d==3 else 0),(.455 if d==0 else -.455 if d==2 else 0),.15),(.065 if d%2 else .96,.96 if d%2 else .065,.30),material,.02)
ice_base();export_asset('terrain-ice',1400)
for tile,directions in ((26,(1,2)),(27,(2,3)),(28,(0,3)),(29,(0,1))):
    ice_base();edges(directions);export_asset('terrain-ice-'+str(tile),1700)
for tile,directions in ((6,(0,)),(7,(3,)),(8,(2,)),(9,(1,)),(48,(1,2))):
    edges(directions);export_asset('terrain-thin-'+str(tile),250)

plate('fire-grate','rubber');frame('fire-grate-rim',.09,'edge')
for i in range(5):
    x=(i%3-1)*.24;y=(i//3-.5)*.28
    curve_mesh('flame-ribbon',[(x,y,.1),(x-.035,y,.24),(x+.045,y,.40),(x+.01,y,.57+(i%2)*.12)],.075,'orange')
    curve_mesh('flame-heart',[(x,y-.055,.12),(x+.02,y-.055,.24),(x,y-.055,.36)],.033,'yellow')
export_asset('terrain-fire',4500)

for tile,angle in ((13,math.pi),(18,0),(19,-math.pi/2),(20,math.pi/2),(50,0)):
    plate('conveyor','rubber');frame('conveyor-frame',.095,'edge')
    for y in (-.22,.20):
        for side in (-1,1):
            obj=box('conveyor-chevron',(side*.145,y,.102),(.41,.115,.035),'green',.012);obj.rotation_euler.z=side*math.pi/4
    # Blender +Z maps to glTF +Y, preserving rotation about the up axis.
    for obj in parts:
        obj.location=Vector((math.cos(angle)*obj.location.x-math.sin(angle)*obj.location.y,math.sin(angle)*obj.location.x+math.cos(angle)*obj.location.y,obj.location.z))
        obj.rotation_euler.z+=angle
    export_asset('terrain-force-'+str(tile),1300)

for tile,color in ((35,'green'),(36,'red'),(39,'earth'),(40,'blue')):
    disc('button-socket',(0,0,.04),.33,.08,'edge')
    disc('button-rim',(0,0,.09),.28,.05,'bronze')
    disc('button-switch',(0,0,.145),.235,.10,color)
    box('button-highlight',(0,-.09,.199),(.16,.027,.012),'eye',.004)
    export_asset('terrain-button-'+str(tile),1000)

plate('earth-tile','earth')
for i in range(9):sphere('earth-clod',((i%3-1)*.29,(i//3-1)*.29,.10),(.105,.075,.035),'edge')
export_asset('terrain-dirt',4000)
box('block',(0,0,.36),(.87,.87,.72),'earth',.055)
for y in (-.23,0,.23):box('block-grain',(0,y,.725),(.67,.026,.012),'edge',.006)
for side in (-1,1):box('block-band',(side*.29,0,.365),(.055,.885,.74),'bronze',.01)
export_asset('terrain-block',1200)

disc('hint-rim',(0,0,.06),.34,.10,'bronze');disc('hint-face',(0,0,.12),.29,.04,'yellow')
curve_mesh('question-hook',[(-.12,.10,.148),(-.10,.20,.148),(.08,.20,.148),(.13,.10,.148),(0,-.025,.148),(0,-.09,.148)],.029,'rubber')
disc('question-dot',(0,-.19,.15),.034,.015,'rubber');export_asset('terrain-hint',1700)

sphere('bomb-shell',(0,0,.28),(.245,.245,.245),'rubber')
disc('bomb-collar',(0,0,.51),.075,.075,'bronze')
curve_mesh('bomb-fuse',[(0,0,.55),(.01,0,.64),(.09,0,.67)],.018,'earth')
sphere('bomb-spark',(.09,0,.67),(.032,.026,.037),'orange');export_asset('terrain-bomb',1900)

plate('trap-recess','rubber');frame('trap-frame',.10,'edge')
for side in (-1,1):
    box('trap-jaw',(side*.34,0,.15),(.085,.69,.10),'bronze',.018)
    for y in (-.25,-.125,0,.125,.25):
        bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.08,radius2=0,depth=.18,location=(side*.3,y,.24))
        finish(bpy.context.object,'trap-tooth','bronze')
export_asset('terrain-trap',1300)
plate('cloner-platform');frame('cloner-rim',.10)
for x in (-.23,.23):
    box('cloner-inset',(x,0,.11),(.28,.62,.03),'portal',.02)
    box('cloner-plus-v',(x,0,.14),(.045,.26,.018),'light-blue',.004)
    box('cloner-plus-h',(x,0,.14),(.19,.045,.018),'light-blue',.004)
export_asset('terrain-cloner',1500)

for name,closed in (('toggle-open',False),('toggle-closed',True)):
    plate('toggle-base','edge');frame('toggle-border',.11,'green')
    if closed:box('toggle-raised',(0,0,.32),(.78,.78,.55),'edge',.04)
    for x in (-.22,.22):box('toggle-indicator',(x,0,.61 if closed else .12),(.065,.47,.025),'green',.009)
    export_asset('terrain-'+name,1000)
box('blue-wall',(0,0,.34),(.95,.95,.68),'water',.05);export_asset('terrain-blue-wall',150)
plate('popup-pad');frame('popup-rim',.105)
for side in (-1,1):
    part=box('popup-chevron',(side*.12,0,.11),(.34,.065,.022),'rubber',.008);part.rotation_euler.z=side*math.pi/4
export_asset('terrain-popup',1200)
disc('thief-border',(0,0,.04),.35,.075,'bronze');disc('thief-mask',(0,0,.09),.29,.035,'rubber')
for side in (-1,1):
    obj=sphere('mask-eye',(side*.12,0,.12),(.095,.05,.012),'eye');obj.rotation_euler.z=side*.3
export_asset('terrain-thief',1600)
for i in range(12):
    obj=box('gravel',((i%4-1.5)*.23,(i//4-1)*.29,.055),(.17,.20,.11),'edge' if i%2 else 'obsidian',.035);obj.rotation_euler.z=i*.73
export_asset('terrain-gravel',1100)
