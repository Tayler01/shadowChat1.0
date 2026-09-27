"""Rounded, sewn folios using the study's existing paper/leather materials."""
import bpy
import math


def reshape_folios(g):
    groups = g['groups']
    # Replace the generated block placeholders before the shared groups join.
    for objects in groups.values():
        for obj in list(objects):
            if obj.name.startswith(('Folio page block', 'Embossed folio cover', 'Stacked folio spine', 'Folio brass corner')):
                objects.remove(obj)
                bpy.data.objects.remove(obj, do_unlink=True)

    def outline(width, depth, radius, inset=0):
        points = []
        w, d = width / 2 - inset, depth / 2 - inset
        for cx, cz, start in [(w-radius,d-radius,0),(-w+radius,d-radius,90),(-w+radius,-d+radius,180),(w-radius,-d+radius,270)]:
            for segment in range(4):
                a = math.radians(start + segment * 30)
                points.append((cx + radius * math.cos(a), cz + radius * math.sin(a)))
        return points

    def mesh_object(name, center, vertices, faces, material, wear=None, smooth=False):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(x,-z,y) for x,y,z in vertices], [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.location = g['p'](center)
        for face in mesh.polygons:
            face.use_smooth = smooth
        if wear:
            attribute = mesh.attributes.new('LeatherWear', 'FLOAT', 'POINT')
            for item, value in zip(attribute.data, wear):
                item.value = value
        return g['register'](obj, name, material)

    def close_rings(vertices, ring_size, rings):
        faces = []
        for ring in range(rings - 1):
            for side in range(ring_size):
                a = ring * ring_size + side
                b = ring * ring_size + (side + 1) % ring_size
                faces.append((a,a+ring_size,b+ring_size,b))
        # x/z becomes x/-y in Blender, so the outline winds clockwise.
        faces.append(tuple(range(ring_size)))
        faces.append(tuple((rings-1)*ring_size + i for i in reversed(range(ring_size))))
        return faces

    for index in range(4):
        g['folio_index'] = index
        center = (-7.8, -.7 + index*.33, 3.2)
        g['group'] = 'StudyPaper'
        vertices = []
        # Ten sewn gatherings, each with a slightly different cut and a recessed
        # boundary. The open fore-edge is opposite the leather spine.
        for gathering in range(10):
            edge = .013*math.sin(gathering*2.31+index)
            for lip in range(2):
                y = -.125 + (gathering*2+lip)*.25/19
                for x,z in outline(2.79+edge, 1.99+edge, .045, .008 if lip==0 else 0):
                    x += .005*math.sin(z*7+gathering)
                    z += .006*math.sin(x*6+gathering*1.7)
                    if z > .8:
                        z -= .045*(1-min(1,abs(x)/1.4)**2)
                    vertices.append((x,y,z))
        mesh_object('Hand cut folio gatherings', center, vertices, close_rings(vertices,16,20), g['paper'])

        g['group'] = 'StudyLeather'
        for cover in [-1,1]:
            vertices, wear = [], []
            for thickness,inset in [(-.03,.022),(-.020,0),(.018,0),(.030,.018)]:
                for x,z in outline(2.95,2.12,.085,inset):
                    corner = (abs(x)/1.475)*(abs(z)/1.06)
                    bend = max(0,corner-.55)*.022*math.sin(index*1.4+x*2-z)
                    # Bottom binding stays seated; the upper board has worn lips.
                    y = cover*.16+thickness+(bend if cover>0 else 0)
                    vertices.append((x,y,z))
                    wear.append(1+(corner*.35+.09*math.sin(x*13+z*7+index))*(1 if inset==0 else .4))
            mesh_object('Soft worn folio board',center,vertices,close_rings(vertices,16,4),g['leathers'][index],wear)

        # A single rounded leather back includes raised sewing supports, rather
        # than rectangular strips pasted over a flat spine.
        vertices, wear, faces = [], [], []
        columns, arcs = 40, 10
        for column in range(columns+1):
            x = -1.475 + 2.95*column/columns
            support = max(math.exp(-((x-band)/.043)**2) for band in [-1.12,-.658,.658,1.12])
            for arc in range(arcs+1):
                angle = -math.pi/2 + math.pi*arc/arcs
                y = .155*math.sin(angle)
                z = -1.013-(.132+.024*support)*math.cos(angle)
                vertices.append((x,y,z))
                wear.append(1+.24*support+.11*abs(math.sin(angle)))
                if column<columns and arc<arcs:
                    a=column*(arcs+1)+arc
                    faces.append((a,a+1,a+arcs+2,a+arcs+1))
        for end in range(2):
            cap=len(vertices);start=end*columns*(arcs+1)
            vertices.append((-1.475+end*2.95,0,-1.013));wear.append(1.15)
            for arc in range(arcs):
                faces.append((cap,start+arc+(1 if end==0 else 0),start+arc+(0 if end==0 else 1)))
        mesh_object('Sewn rounded folio back',center,vertices,faces,g['leathers'][index],wear,True)
    g['folio_index'] = None
