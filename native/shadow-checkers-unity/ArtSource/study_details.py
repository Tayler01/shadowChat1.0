"""Foreground detail pass for create_study.py; preserves its room coordinates.

Uses the existing source photographs and shared material groups. No new
third-party assets or per-prop runtime materials are required.
"""
import bpy
import math
import random
from mathutils import Vector, Matrix


def enrich_study(g):
    rng = random.Random(92426)
    groups = g['groups']
    dynamic = ['StudyWood', 'StudyPaper', 'StudyLeather', 'StudyWax', 'StudyMaps', 'StudyWine', 'StudyInk', 'StudyStone']
    for name in dynamic:
        groups[name] = []
    for source in ['StudyArchitecture', 'StudyFurnishings']:
        for obj in list(groups[source]):
            if obj.name.startswith(('Bound vellum pages', 'Leather book board', 'Rounded leather spine')):
                for modifier in obj.modifiers:
                    if modifier.type == 'BEVEL': modifier.segments = 1
            mat = obj.data.materials[0]
            destination = None
            if mat == g['mapmat']:
                destination = 'StudyMaps'
            elif mat == g['stone']:
                destination = 'StudyStone'
            elif mat == g['wax']:
                destination = 'StudyWax'
            elif obj.name.startswith(('Writing table plank', 'Table carved apron', 'Turned table leg', 'Apron inset')):
                destination = 'StudyWood'
            elif obj.name.startswith('Folio page block'):
                destination = 'StudyPaper'
            elif obj.name.startswith(('Embossed folio cover', 'Stacked folio spine')):
                destination = 'StudyLeather'
            elif obj.name.startswith('Ink bottle'):
                destination = 'StudyInk'
            if destination:
                groups[source].remove(obj)
                groups[destination].append(obj)

    # Keep full source maps independent of the low-density room light atlases.
    for filename in ['OakColor.jpg', 'OakNormal.jpg', 'OakRough.jpg', 'HearthStoneColor.jpg', 'HearthStoneNormal.jpg']:
        g['publish_copy'](g['SOURCE'] / filename, g['TEX'] / filename)
    g['publish_copy'](g['ROOT'] / 'ArtSource/MercatorWorldMap.jpg', g['TEX'] / 'StudyMap.jpg')

    box, lathe, torus = g['box'], g['lathe'], g['torus']
    brass, wax, paper = g['brass'], g['wax'], g['paper']
    palette = [(.075, .018, .008), (.009, .035, .021), (.075, .040, .014), (.033, .012, .025)]
    from study_folios import reshape_folios
    reshape_folios(g)

    # Separate individual fore-edges and restrained gold tooling on all four folios.
    font_path = 'C:/Windows/Fonts/georgia.ttf'
    font = bpy.data.fonts.load(font_path) if __import__('os').path.exists(font_path) else None
    for index, title in enumerate(['NOCTIS', 'HISTORIA', 'NAVIGATIO', 'ATLAS']):
        g['folio_index'] = index
        x, y, z = -7.8, -.7 + index * .33, 3.2
        top = y + .197
        for inset in [.15, .23]:
            for side in [-1, 1]:
                box('Gilt folio ruling', (x, top, z + side * (1.06 - inset)), (2.95 - inset * 2, .009, .009), brass, .002)
                box('Gilt folio ruling', (x + side * (1.475 - inset), top, z), (.009, .009, 2.12 - inset * 2), brass, .002)
        for radius in [.25, .29]:
            torus('Folio stamped medallion', (x, top + .004, z), radius, .008, brass)
        for petal in range(8):
            angle = petal * math.tau / 8
            torus('Folio gilt rosette', (x + math.cos(angle) * .145, top + .004, z + math.sin(angle) * .145), .075, .006, brass)
        text = bpy.data.curves.new('Stamped folio title', 'FONT')
        text.body = title
        if font:
            text.font = font
        text.align_x = 'CENTER'; text.size = .16; text.extrude = .001; text.resolution_u = 3
        obj = bpy.data.objects.new('Stamped folio title', text)
        bpy.context.collection.objects.link(obj)
        obj.location = g['p']((x, top + .008, z - .59))
        g['register'](obj, 'Stamped folio title', brass)
        spine_text = bpy.data.curves.new('Gilt spine title', 'FONT')
        spine_text.body = title; spine_text.align_x = 'CENTER'; spine_text.size = .105; spine_text.resolution_u = 2
        if font: spine_text.font = font
        spine = bpy.data.objects.new('Gilt spine title', spine_text)
        bpy.context.collection.objects.link(spine)
        spine.location = g['p']((x, y-.035, z-1.157))
        spine.rotation_euler = (math.pi/2,0,math.pi)
        bpy.ops.object.select_all(action='DESELECT'); spine.select_set(True); bpy.context.view_layer.objects.active = spine
        bpy.ops.object.convert(target='MESH'); bpy.context.view_layer.update()
        # Foil follows the rounded back instead of floating on a flat label.
        inverse = spine.matrix_world.inverted()
        for vertex in spine.data.vertices:
            world = spine.matrix_world @ vertex.co
            height = (world.z-y)/.155
            world.y = -z+1.013+.132*math.sqrt(max(0,1-height*height))+.002
            vertex.co = inverse @ world
        spine.data.update(); g['register'](spine,'Gilt spine title',brass)
    g['folio_index'] = None

    # Aged bindings vary in tone, while their existing tooling atlas stays shared.
    def paint(obj, color, alpha=1):
        if obj.type == 'FONT':
            bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
            bpy.ops.object.convert(target='MESH')
        if obj.type != 'MESH':
            return
        layer = obj.data.color_attributes.get('SurfaceTint') or obj.data.color_attributes.new(name='SurfaceTint', type='FLOAT_COLOR', domain='CORNER')
        wear = obj.data.attributes.get('LeatherWear')
        for loop in obj.data.loops:
            variation = wear.data[loop.vertex_index].value if wear else 1
            layer.data[loop.index].color = (*(channel*variation for channel in color), alpha)

    for obj in groups['StudyBindings']:
        color = rng.choice([(.96, .69, .45), (.62, .78, .67), (.90, .46, .34), (.70, .55, .78), (.94, .85, .65)])
        paint(obj, color)
    for obj in groups['StudyLeather']:
        level = max(0, min(3, round((obj.location.z + .7) / .33)))
        paint(obj, palette[level])

    # Model wax pooling and asymmetry; broad drips and small runs have distinct shapes.
    candle_positions = [(-7.6, -.955, -3.5, 1.6), (7.1, -.955, 4.5, 1.2), (7.9, -.955, -5.8, .85), (8, 2.13, 13.1, 1.6), (13.3, 2.13, 13.1, 1.15)]
    g['group'] = 'StudyWax'
    for x, y, z, height in candle_positions:
        lathe('Pooled beeswax in drip cup', (x, y + 1.045, z), [(0, 0), (.16, 0), (.195, .012), (.17, .038), (.13, .045)], wax, 32)
        for drip in range(4):
            angle = drip * 1.7 + .6
            length = rng.uniform(.09, .32)
            lathe('Fine wax run', (x + .126 * math.cos(angle), y + 1.08 + height - length - .09, z + .126 * math.sin(angle)),
                  [(0, 0), (.013, .008), (.018, .035), (.013, length * .7), (.008, length), (0, length + .018)], wax, 10)
        for ring_height, radius in [(.06, .38), (.12, .32), (.57, .14), (1.015, .24), (1.075, .24)]:
            torus('Engraved candlestick ring', (x, y + ring_height, z), radius, .009, brass)
        for bead in range(24):
            angle = bead * math.tau / 24
            lathe('Beaded candle foot', (x + .35 * math.cos(angle), y + .09, z + .35 * math.sin(angle)), [(0, 0), (.014, .009), (0, .023)], brass, 6)
    for obj in groups['StudyWax']:
        if obj.name.startswith('Cooled wax drip'):
            # Drips begin below the melted lip instead of protruding like spikes.
            obj.location.z -= .10
        if obj.name.startswith('Hand dipped wax'):
            for vertex in obj.data.vertices:
                angle = math.atan2(vertex.co.y, vertex.co.x)
                radius = math.hypot(vertex.co.x, vertex.co.y)
                if radius > .07:
                    scale = 1 + .055 * math.sin(angle * 3 + vertex.co.z * 4) + .018 * math.sin(angle * 7)
                    vertex.co.x *= scale; vertex.co.y *= scale
            obj.data.update()
        paint(obj, (1, .96, .85))
        maximum = max((v.co.z for v in obj.data.vertices), default=1)
        layer = obj.data.color_attributes['SurfaceTint']
        for loop in obj.data.loops:
            height = obj.data.vertices[loop.vertex_index].co.z
            layer.data[loop.index].color[3] = max(0, min(1, (height / max(.01, maximum) - .55) / .45)) * (1 if obj.name.startswith('Hand dipped wax') else .2)

    # Worked drinking vessel, rolled lip, chased bands and a dark wine meniscus.
    for height, radius in [(0.05, .325), (.70, .16), (.91, .34), (1.10, .365), (1.24, .38), (1.50, .34)]:
        torus('Chased goblet band', (8.2, -.955 + height, -2.7), radius, .008, brass)
    for flute in range(16):
        angle = flute * math.tau / 16
        lathe('Goblet chased teardrop', (8.2 + .348 * math.cos(angle), -.955 + .96, -2.7 + .348 * math.sin(angle)), [(0, 0), (.016, .025), (.011, .10), (0, .16)], brass, 6)
    wine = g['material']('Dark red wine', (.065, .008, .014), .08)
    g['group'] = 'StudyWine'
    lathe('Wine surface and meniscus', (8.2, -.955 + 1.32, -2.7), [(.308, .016), (.304, .006), (.29, 0), (0, 0)], wine, 48)

    # Incised graduations follow the tilted armillary band in local space.
    equator = next(o for o in groups['StudyMetals'] if o.name.startswith('Armillary equator'))
    bpy.context.view_layer.update()
    for tick in range(72):
        angle = tick * math.tau / 72
        obj = box('Armillary engraved graduation', (0, 0, 0), (.026 if tick % 6 == 0 else .012, .002, .055 if tick % 6 == 0 else .025), brass, 0)
        obj.matrix_world = equator.matrix_world @ Matrix.Translation(Vector((1.1*math.cos(angle),1.1*math.sin(angle),.047))) @ Matrix.Rotation(angle-math.pi/2,4,'Z')
        obj['engraving'] = True
    for index, numeral in enumerate(['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI']):
        angle = index * math.tau / 12
        text = bpy.data.curves.new('Armillary zodiac scale', 'FONT');text.body=numeral;text.align_x='CENTER';text.size=.055;text.resolution_u=2
        if font: text.font=font
        obj=bpy.data.objects.new('Armillary incised numeral',text);bpy.context.collection.objects.link(obj)
        obj.matrix_world=equator.matrix_world @ Matrix.Translation(Vector((1.1*math.cos(angle),1.1*math.sin(angle),.05))) @ Matrix.Rotation(angle-math.pi/2,4,'Z')
        g['register'](obj,'Armillary incised numeral',brass);obj['engraving']=True
    # Rolled ceramic lip and foot with restrained brass maker's bands.
    g['group']='StudyInk'
    for height,radius in [(.045,.232),(.40,.236),(.61,.132)]:
        torus('Ink pot rolled glaze',(-7.1,-.955+height,-4),radius,.012,g['iron'])
    for height in [.47,.53]:torus('Ink pot engraved neck',(-7.1,-.955+height,-4),.136,.008,brass)
    stamp=bpy.data.curves.new('Ink makers seal','FONT');stamp.body='SC';stamp.align_x='CENTER';stamp.size=.09;stamp.resolution_u=3
    if font:stamp.font=font
    obj=bpy.data.objects.new('Ink makers seal',stamp);bpy.context.collection.objects.link(obj)
    obj.location=g['p']((-7.1,-.955+.24,-4.245));obj.rotation_euler=(-math.pi/2,0,0)
    g['register'](obj,'Ink makers seal',brass)

    # Curl table parchment at its edges; preserve the full source map UVs.
    for obj in groups['StudyMaps']:
        if obj.name.startswith(('Desk parchment', 'Folded charts')):
            bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.subdivide(number_cuts=12); bpy.ops.object.mode_set(mode='OBJECT')
            max_x = max(abs(v.co.x) for v in obj.data.vertices)
            max_y = max(abs(v.co.y) for v in obj.data.vertices)
            for vertex in obj.data.vertices:
                edge = max(abs(vertex.co.x) / max_x, abs(vertex.co.y) / max_y)
                vertex.co.z += .002 + .055 * max(0, (edge - .72) / .28) ** 2 * (.7 + .3 * math.sin(vertex.co.x * 4 + vertex.co.y * 2))
            obj.data.update(); obj.select_set(False)
        paint(obj, (1, 1, 1))

    # Dedicated stone texels and baked crevice AO survive the wide room atlas.
    # Spatial UVs give the joined masonry a coherent, unstretched grain scale.
    for obj in groups['StudyStone']:
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name='UVMap')
        uv = obj.data.uv_layers.active
        paint(obj, (1, 1, 1))
        tint = obj.data.color_attributes['SurfaceTint']
        age = rng.uniform(.78, 1)
        for face in obj.data.polygons:
            normal = obj.matrix_world.to_3x3() @ face.normal
            axis = max(range(3), key=lambda i: abs(normal[i]))
            for index in face.loop_indices:
                co = obj.matrix_world @ obj.data.vertices[obj.data.loops[index].vertex_index].co
                uv.data[index].uv = ((co.x * .18, co.y * .18) if axis == 2 else (co.x * .18, co.z * .18) if axis == 1 else (co.y * .18, co.z * .18))
                # Blender Z is height; negative Y is the back of the room.
                plume = max(0, 1 - abs(co.x - 10.5) / 2.9)
                rising = max(0, min(1, (co.z + 3.3) / 4.5))
                soot = plume * rising * .52 if co.y < -13.6 else 0
                shade = age * (1 - soot)
                tint.data[index].color = (shade, shade * .98, shade * .94, 1)

    # Spatial UVs keep grain at a physical scale across joined wood objects.
    for obj in groups['StudyWood']:
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name='UVMap')
        uv = obj.data.uv_layers.active
        for face in obj.data.polygons:
            normal = obj.matrix_world.to_3x3() @ face.normal
            axis = max(range(3), key=lambda i: abs(normal[i]))
            for index in face.loop_indices:
                co = obj.matrix_world @ obj.data.vertices[obj.data.loops[index].vertex_index].co
                uv.data[index].uv = ((co.x * .24, co.y * .16) if axis == 2 else (co.x * .24, co.z * .18) if axis == 1 else (co.y * .16, co.z * .18))
        shade = rng.uniform(.82, 1)
        paint(obj, (shade, shade * .97, shade * .91))
    for obj in groups['StudyPaper']:
        shade = rng.uniform(.88, 1)
        paint(obj, (shade, shade, shade * .96))
    for obj in groups['StudyMetals']:
        shade = rng.uniform(.70, 1)
        paint(obj, (.07,.055,.035) if obj.get('engraving') else (shade, shade * rng.uniform(.91, 1), shade * rng.uniform(.78, .95)))
    for obj in groups['StudyWine']:
        paint(obj, (1, 1, 1))
    for obj in groups['StudyInk']:
        paint(obj, (1, 1, 1))
    # Lighting atlases cannot retain close wood fibres over the whole room.
    # Keep an independent, physical-scale grain coordinate and material mask;
    # the runtime detail multiplies the existing baked light, including shadow.
    for name in ['StudyArchitecture', 'StudyFurnishings']:
        for obj in groups[name]:
            if obj.type != 'MESH':
                continue
            is_wood = obj.data.materials[0] in (g['wood'], g['woodedge'])
            paint(obj, (1 if is_wood else 0, 0, 0))
            uv = obj.data.uv_layers.new(name='SurfaceDetail')
            if not is_wood:
                continue
            extents = [max(v.co[i] for v in obj.data.vertices) - min(v.co[i] for v in obj.data.vertices) for i in range(3)]
            grain_axis = max(range(3), key=lambda axis: extents[axis])
            if any(word in obj.name.lower() for word in ['wall', 'wainscot', 'backing', 'pilaster']):
                grain_axis = 2  # upright boards, regardless of the wall's width
            seed = sum((i + 1) * ord(c) for i, c in enumerate(obj.name))
            offset = ((seed % 997) / 997, ((seed * 31) % 991) / 991)
            for face in obj.data.polygons:
                normal_axis = max(range(3), key=lambda axis: abs(face.normal[axis]))
                axes = [axis for axis in range(3) if axis != normal_axis]
                along = grain_axis if grain_axis in axes else max(axes, key=lambda axis: extents[axis])
                across = next(axis for axis in axes if axis != along)
                for index in face.loop_indices:
                    co = obj.data.vertices[obj.data.loops[index].vertex_index].co
                    uv.data[index].uv = (co[across] * .24 + offset[0], co[along] * .18 + offset[1])
    # Place each complete folio on the previous cover, using unequal dimensions
    # and small offsets. The bottom cover rests on the actual tabletop plane.
    bpy.context.view_layer.update()
    base=-.955
    for index,(sx,sy,sz,yaw,dx,dz) in enumerate([(1.05,1.1,1.02,-.035,0,0),(.92,.85,.87,.04,.12,.09),(.99,1.03,.96,-.015,-.06,-.05),(.82,.9,.9,.07,.08,.12)]):
        old=Vector(g['p']((-7.8,-.7+index*.33,3.2)))
        center=Vector(g['p']((-7.8+dx,base+.19*sy,3.2+dz)))
        transform=Matrix.Translation(center) @ Matrix.Rotation(yaw,4,'Z') @ Matrix.Diagonal((sx,sz,sy,1)) @ Matrix.Translation(-old)
        for objects in groups.values():
            for obj in objects:
                if obj.get('folio_index') == index: obj.matrix_world=transform @ obj.matrix_world
        base += .395*sy
    g['group'] = 'StudyFurnishings'
    bpy.ops.object.select_all(action='DESELECT')
    print('FOREGROUND_DETAIL_GROUPS', {name: len(groups[name]) for name in dynamic}, flush=True)
