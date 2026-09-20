"""Reference-led explorer sculpt. Executed inside build_calibration's material/export context."""

def curve_mesh(name, points, radius, material, cyclic=False):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=5
    curve.bevel_depth=radius;curve.bevel_resolution=1
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for point,co in zip(spline.bezier_points,points):
        point.co=co;point.handle_left_type='AUTO';point.handle_right_type='AUTO'
    spline.use_cyclic_u=cyclic
    obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return finish(bpy.context.object,name,material)

def smooth_box(name,position,size,material,bevel):
    obj=box(name,position,size,material)
    mod=obj.modifiers.new('soft-molded-edge','BEVEL');mod.width=bevel;mod.segments=3
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons:p.use_smooth=True
    mod=obj.modifiers.new('weighted-face-normals','WEIGHTED_NORMAL')
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

# Full height 1.18 units, with a rounded head and human-shaped torso/limbs.
for side in (-1,1):
    smooth_box('shoe-sole',(side*.106,-.055,.047),(.18,.295,.075),'rubber',.045)
    sphere('shoe-upper',(side*.106,-.058,.10),(.091,.146,.092),'rubber')
    for y in (-.045,-.012,.02):curve_mesh('laces',[(side*.106-.055,y,.169),(side*.106,y-.006,.18),(side*.106+.055,y,.169)],.006,'edge')
    smooth_box('pants-leg',(side*.106,.006,.285),(.176,.192,.32),'pants',.065)
    smooth_box('trouser-cuff',(side*.106,.006,.156),(.181,.199,.057),'pants',.02)

smooth_box('shirt-body',(0,0,.565),(.407,.257,.353),'cloth',.10)
smooth_box('trouser-waist',(0,0,.414),(.373,.255,.105),'pants',.04)
smooth_box('belt',(0,-.002,.449),(.407,.273,.045),'rubber',.035)
smooth_box('belt-buckle',(0,-.149,.449),(.073,.023,.048),'bronze',.008)
smooth_box('buckle-inset',(0,-.165,.449),(.052,.006,.028),'rubber',.002)
rod('neck',(0,0,.69),(0,0,.8),.065,'skin')

for side in (-1,1):
    # Natural arm bend and separate cuffs; sculpted palms, thumbs and four fingers.
    shoulder=(side*.202,.004,.684);elbow=(side*.25,-.012,.573);wrist=(side*.275,-.037,.486)
    sleeve=sphere('upper-sleeve',((shoulder[0]+elbow[0])/2,0,.635),(.088,.101,.142),'cloth')
    sleeve.rotation_euler.y=side*.25
    sphere('lower-sleeve',(side*.265,-.029,.532),(.072,.089,.093),'cloth')
    cuff=smooth_box('shirt-cuff',(side*.276,-.039,.495),(.139,.16,.05),'cloth',.02)
    cuff.rotation_euler.y=side*.17
    sphere('hand-palm',(side*.282,-.045,.43),(.055,.047,.077),'skin')
    sphere('thumb',(side*.235,-.078,.438),(.027,.026,.042),'skin')
    for i in range(4):
        sphere('finger',(side*(.253+i*.018),-.061-i*.002,.391+abs(i-1.5)*.007),(.014,.025,.037),'skin')
    # Front pockets, rolled collar and the nearly black backpack webbing.
    smooth_box('shirt-pocket',(side*.102,-.136,.566),(.105,.013,.098),'pants',.012)
    smooth_box('pocket-flap',(side*.102,-.151,.607),(.11,.014,.034),'cloth',.009)
    sphere('pocket-button',(side*.102,-.161,.604),(.009,.004,.009),'bronze')
    collar=smooth_box('collar',(side*.064,-.096,.715),(.10,.035,.095),'pants',.008)
    collar.rotation_euler.y=side*.43
    curve_mesh('backpack-strap',[(side*.135,.10,.73),(side*.157,-.102,.729),(side*.167,-.15,.606),(side*.145,-.13,.48)],.023,'rubber')
    smooth_box('strap-buckle',(side*.163,-.172,.581),(.05,.018,.044),'bronze',.007)
    smooth_box('strap-buckle-inset',(side*.163,-.183,.581),(.031,.006,.026),'rubber',.003)
curve_mesh('shirt-placket',[(0,-.125,.685),(0,-.147,.61),(0,-.14,.465)],.008,'pants')
for z in (.502,.56,.619,.665):sphere('shirt-button',(0,-.152,z),(.008,.005,.008),'bronze')
smooth_box('backpack',(0,.176,.601),(.305,.165,.337),'rubber',.058)
smooth_box('backpack-pocket',(0,.269,.547),(.261,.045,.155),'pack',.025)
curve_mesh('backpack-zip',[(-.11,.287,.61),(0,.299,.622),(.11,.287,.61)],.005,'edge')

# Soft jaw, cheeks and ears, rather than a cylinder or toy helmet.
head=sphere('face',(0,-.003,.893),(.176,.148,.193),'skin')
for vertex in head.data.vertices:
    if vertex.co.z<-.02:vertex.co.x*=.92+max(0,vertex.co.z+.19)*.45
for side in (-1,1):
    sphere('ear',(side*.175,.002,.901),(.041,.032,.061),'skin')
    sphere('ear-fold',(side*.193,-.024,.903),(.012,.01,.032),'skin')
    sphere('eye-white',(side*.073,-.144,.928),(.039,.014,.045),'eye')
    sphere('iris',(side*.070,-.158,.931),(.018,.009,.027),'rubber')
    sphere('eye-glint',(side*.063,-.167,.942),(.006,.004,.008),'eye')
    # Rounded rectangular frame, with open lenses: actual face and eyes visible through it.
    cx=side*.079
    points=[(cx-.049,-.166,.978),(cx+.049,-.166,.978),(cx+.061,-.163,.966),(cx+.055,-.169,.887),(cx+.043,-.173,.876),(cx-.046,-.173,.881),(cx-.056,-.168,.895),(cx-.061,-.162,.965)]
    curve_mesh('glasses-frame',points,.009,'rubber',True)
    curve_mesh('glasses-temple',[(side*.14,-.164,.967),(side*.179,-.06,.956),(side*.187,.024,.951)],.008,'rubber')
    curve_mesh('brow',[(side*.037,-.139,.995),(side*.078,-.144,1.008),(side*.12,-.12,1.002)],.011,'hair')
curve_mesh('glasses-bridge',[(-.019,-.169,.946),(0,-.178,.95),(.019,-.169,.946)],.009,'rubber')
sphere('nose',(0,-.154,.891),(.029,.035,.039),'skin')
curve_mesh('smile',[(-.042,-.14,.836),(0,-.151,.829),(.041,-.14,.837)],.004,'hair')

# A continuous swept cap with a large front quiff. Fine same-color strands provide relief.
sphere('hair-back',(0,.052,1.004),(.182,.139,.159),'hair')
for side in (-1,1):
    lock=sphere('hair-side',(side*.147,.013,1.008),(.041,.116,.099),'hair')
    lock.rotation_euler.y=side*.2
quiff=sphere('swept-quiff',(.015,-.063,1.087),(.187,.131,.074),'hair')
quiff.rotation_euler=(.19,-.14,-.21)
forelock=sphere('front-lock',(-.107,-.104,1.055),(.087,.055,.081),'hair')
forelock.rotation_euler.y=-.65
strand_paths=[]
bpy.context.view_layer.update()
for i in range(9):
    angle=.12+i*.145
    points=[]
    for j in range(9):
        x=-.94+j*.23;r=math.sqrt(max(0,1-x*x))
        points.append(quiff.matrix_world@Vector((x*.188,-.132*r*math.cos(angle),.075*r*math.sin(angle))))
    strand_paths.append(points)

def sculpt_union(prefixes,voxel,ratio):
    selected=[obj for obj in parts if any(obj.name.startswith(prefix) for prefix in prefixes)]
    if not selected:return
    bpy.ops.object.select_all(action='DESELECT')
    for obj in selected:obj.select_set(True)
    bpy.context.view_layer.objects.active=selected[0]
    for obj in selected:parts.remove(obj)
    bpy.ops.object.join();obj=bpy.context.object
    remesh=obj.modifiers.new('continuous-sculpt','REMESH');remesh.mode='VOXEL';remesh.voxel_size=voxel;remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=obj.modifiers.new('soft-sculpt','SMOOTH');smooth.factor=.6;smooth.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate=obj.modifiers.new('game-retopology','DECIMATE');decimate.ratio=ratio
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    for polygon in obj.data.polygons:polygon.use_smooth=True
    parts.append(obj)

sculpt_union(['hair-back','hair-side','swept-quiff','front-lock'],.008,.1)
sculpt_union(['shirt-body','upper-sleeve','lower-sleeve','shirt-cuff'],.009,.1)
for points in strand_paths:curve_mesh('quiff-strand',points,.0016,'hair')
export_asset('hero-explorer',28000)
