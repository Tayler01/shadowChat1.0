using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

// A furnished far side of the table, assembled once into three shared-material
// meshes. The chair reuses the existing wood, leather and brass materials.
public sealed class StudyChair : MonoBehaviour
{
    readonly List<Mesh> owned=new List<Mesh>();

    sealed class Geometry
    {
        public readonly List<Vector3> vertices=new List<Vector3>();
        public readonly List<Vector2> uv=new List<Vector2>();
        public readonly List<Color> colors=new List<Color>();
        public readonly List<int> indices=new List<int>();

        public void Box(Vector3 position,Vector3 size,float bevel,Color tint,Quaternion rotation)
        {
            var shape=StoneBaseMesh.Create(size,bevel);
            int first=vertices.Count;
            foreach(var vertex in shape.vertices) {
                var p=position+rotation*vertex;
                vertices.Add(p);uv.Add(new Vector2(p.x*.32f+p.z*.17f,p.y*.38f+p.z*.24f));colors.Add(tint);
            }
            foreach(int index in shape.triangles)indices.Add(first+index);
            Object.Destroy(shape);
        }

        public void Turn(Vector3 position,Vector2[] profile,Color tint,Quaternion rotation,int sides=12)
        {
            int first=vertices.Count;
            for(int ring=0;ring<profile.Length;ring++)for(int side=0;side<=sides;side++) {
                float angle=side*Mathf.PI*2/sides;
                var p=new Vector3(Mathf.Cos(angle)*profile[ring].x,profile[ring].y,Mathf.Sin(angle)*profile[ring].x);
                vertices.Add(position+rotation*p);uv.Add(new Vector2(side/(float)sides,profile[ring].y*.6f));colors.Add(tint);
                if(ring<profile.Length-1&&side<sides) {
                    int a=first+ring*(sides+1)+side,b=a+sides+1;
                    indices.AddRange(new[]{a,b,a+1,a+1,b,b+1});
                }
            }
            for(int end=0;end<2;end++) {
                int ring=end*(profile.Length-1),cap=vertices.Count;
                vertices.Add(position+rotation*(Vector3.up*profile[ring].y));uv.Add(new Vector2(.5f,.5f));colors.Add(tint);
                for(int side=0;side<sides;side++) {
                    int a=first+ring*(sides+1)+side;
                    indices.AddRange(end==0?new[]{cap,a,a+1}:new[]{cap,a+1,a});
                }
            }
        }

        public void Back(Color tint)
        {
            const int columns=32,rows=40;
            // Small depressions pull the leather towards four offset button rows.
            // Broad padding between them remains curved, not a flat printed grid.
            for(int side=0;side<2;side++) {
                int first=vertices.Count;
                for(int y=0;y<=rows;y++)for(int x=0;x<=columns;x++) {
                    float u=x/(float)columns,v=y/(float)rows;
                    float px=(u-.5f)*2.8f,py=2.5f+v*2.85f;
                    float edge=Mathf.Sin(u*Mathf.PI)*Mathf.Sin(v*Mathf.PI);
                    float dent=0;
                    for(int row=0;row<4;row++)for(int column=0;column<3;column++) {
                        float dx=px-ButtonX(row,column),dy=py-(2.92f+row*.64f);
                        dent+=Mathf.Exp(-(dx*dx+dy*dy)/.038f)*.15f;
                    }
                    float fold=.018f*Mathf.Sin(py*13f+px*2.4f)*edge;
                    float z=1.04f+(py-2.5f)*.085f+(side==0?-.10f-edge*.16f+dent+fold:.13f);
                    vertices.Add(new Vector3(px,py+.20f*Mathf.Sin(u*Mathf.PI)*v*v,z));
                    uv.Add(new Vector2(u,v));
                    // Light catches cracked high spots and rubbed outer edges.
                    float grain=.94f+.035f*Mathf.Sin(px*18.7f+py*11.3f)*Mathf.Sin(py*23.1f);
                    float rubbed=1f+.18f*Mathf.Pow(1-edge,3);
                    colors.Add(tint*grain*rubbed);
                    if(x<columns&&y<rows) {
                        int a=first+y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;
                        indices.AddRange(side==0?new[]{a,c,b,b,c,d}:new[]{a,b,c,b,d,c});
                    }
                }
            }
            int stride=columns+1,back=stride*(rows+1);
            // Stitch all four edges, keeping the chair opaque during the room sweep.
            for(int edge=0;edge<4;edge++) {
                int count=edge<2?columns:rows;
                for(int i=0;i<count;i++) {
                    int a=edge==0?i:edge==1?rows*stride+i:edge==2?i*stride:i*stride+columns;
                    int b=a+(edge<2?1:stride);
                    if(edge==1||edge==2)indices.AddRange(new[]{a,b,a+back,b,b+back,a+back});
                    else indices.AddRange(new[]{a,a+back,b,b,a+back,b+back});
                }
            }
        }

        public void Crest(Color tint,float radiusY,float radiusZ,float depth)
        {
            const int rings=24,sides=12;
            int first=vertices.Count;
            for(int ring=0;ring<=rings;ring++)for(int side=0;side<=sides;side++) {
                float x=-1.5f+3f*ring/rings,a=side*Mathf.PI*2/sides;
                float y=5.47f+.23f*Mathf.Cos(x/1.5f*Mathf.PI*.5f);
                var up=new Vector3(.23f*Mathf.PI/3*Mathf.Sin(x*Mathf.PI/3),1,0).normalized;
                vertices.Add(new Vector3(x,y,depth)+up*(Mathf.Cos(a)*radiusY)+Vector3.forward*(Mathf.Sin(a)*radiusZ));
                uv.Add(new Vector2(x*.32f,side/(float)sides));colors.Add(tint);
                if(ring<rings&&side<sides) {
                    int i=first+ring*(sides+1)+side,j=i+sides+1;
                    indices.AddRange(new[]{i,i+1,j,i+1,j+1,j});
                }
            }
            for(int end=0;end<2;end++) {
                int cap=vertices.Count,start=first+end*rings*(sides+1);
                vertices.Add(new Vector3(end==0?-1.5f:1.5f,5.47f,depth));uv.Add(Vector2.zero);colors.Add(tint);
                for(int side=0;side<sides;side++)indices.AddRange(end==0?new[]{cap,start+side+1,start+side}:new[]{cap,start+side,start+side+1});
            }
        }

        public Mesh Finish(string name)
        {
            var mesh=new Mesh {name=name};mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetColors(colors);
            mesh.SetTriangles(indices,0);mesh.RecalculateNormals();mesh.RecalculateTangents();mesh.RecalculateBounds();return mesh;
        }
    }

    static float ButtonX(int row,int column) {return (column-1)*.78f+(row%2==0?-.14f:.14f);}

    public void Build(Material walnut,Material leather,Material brass)
    {
        transform.localPosition=new Vector3(0,-4.625f,10.15f);
        transform.localRotation=Quaternion.Euler(0,-7,0);
        var frame=new Geometry();var upholstery=new Geometry();var nails=new Geometry();
        var identity=Quaternion.identity;var oak=new Color(.84f,.75f,.65f);var hide=new Color(.19f,.062f,.042f);
        var leg=new[]{new Vector2(.20f,0),new Vector2(.23f,.10f),new Vector2(.16f,.25f),new Vector2(.115f,.63f),new Vector2(.23f,.87f),new Vector2(.23f,1),new Vector2(.13f,1.22f),new Vector2(.15f,1.70f),new Vector2(.22f,1.87f)};
        foreach(float x in new[]{-1.42f,1.42f})foreach(float z in new[]{-.98f,.98f})frame.Turn(new Vector3(x,0,z),leg,oak,identity);
        foreach(float x in new[]{-1.44f,1.44f}) {
            frame.Box(new Vector3(x,1.92f,0),new Vector3(.25f,.40f,2.38f),.06f,oak,identity);
            frame.Box(new Vector3(x,.65f,0),new Vector3(.13f,.13f,2.02f),.04f,oak,identity);
            frame.Box(new Vector3(x,3.86f,1.17f),new Vector3(.24f,3.90f,.29f),.08f,oak,Quaternion.Euler(5,0,0));
            frame.Turn(new Vector3(x,2.14f,-.8f),new[]{new Vector2(.15f,0),new Vector2(.18f,.12f),new Vector2(.09f,.35f),new Vector2(.11f,.82f),new Vector2(.18f,1.08f)},oak,identity);
            frame.Box(new Vector3(x,3.28f,.05f),new Vector3(.40f,.23f,2.47f),.10f,oak,Quaternion.Euler(-3,0,0));
        }
        foreach(float z in new[]{-1.04f,1.04f})frame.Box(new Vector3(0,1.94f,z),new Vector3(2.89f,.39f,.25f),.06f,oak,identity);
        frame.Box(new Vector3(0,.65f,0),new Vector3(2.84f,.14f,.14f),.04f,oak,identity);
        // Narrow inset rails and carved stops give the frame depth without a
        // separate draw call or dense sculpting across the chair silhouette.
        foreach(float x in new[]{-1.44f,1.44f}) {
            frame.Box(new Vector3(x,4.06f,.98f),new Vector3(.09f,2.60f,.075f),.024f,oak*.79f,Quaternion.Euler(5,0,0));
            foreach(float y in new[]{2.60f,5.31f})
                frame.Box(new Vector3(x,y,1.02f),new Vector3(.38f,.10f,.11f),.025f,oak,identity);
        }
        frame.Box(new Vector3(0,2.51f,.99f),new Vector3(2.68f,.09f,.10f),.025f,oak*.86f,identity);
        // Continuous curved molding, with a fine bead carved along its front.
        frame.Crest(oak,.14f,.18f,1.33f);frame.Crest(oak,.028f,.035f,1.155f);
        upholstery.Back(hide);
        upholstery.Box(new Vector3(0,2.19f,-.02f),new Vector3(2.85f,.38f,2.23f),.16f,hide,identity);
        // Discrete welt seams follow the padded panel rather than printing a
        // fabric grid over its surface.
        foreach(float x in new[]{-1.32f,1.32f})
            upholstery.Box(new Vector3(x,3.92f,.90f),new Vector3(.025f,2.55f,.025f),.008f,hide*1.28f,Quaternion.Euler(5,0,0));
        var button=new[]{new Vector2(.053f,0),new Vector2(.061f,.02f),new Vector2(.038f,.043f)};
        for(int row=0;row<4;row++)for(int column=0;column<3;column++) {
            float x=ButtonX(row,column),y=2.92f+row*.64f,u=(x+1.4f)/2.8f,v=(y-2.5f)/2.85f;
            float z=1.04f+(y-2.5f)*.085f-.10f-Mathf.Sin(u*Mathf.PI)*Mathf.Sin(v*Mathf.PI)*.16f+.15f;
            nails.Turn(new Vector3(x,y+.20f*Mathf.Sin(u*Mathf.PI)*v*v,z),button,Color.white,Quaternion.Euler(-90,0,0),8);
        }
        for(int i=0;i<19;i++)nails.Turn(new Vector3(-1.3f+i*2.6f/18,2.18f,-1.145f),button,Color.white,Quaternion.Euler(-90,0,0),8);
        Add("Turned walnut chair frame",frame,walnut,true);Add("Worn oxblood upholstery",upholstery,leather,true);Add("Antique upholstery tacks",nails,brass,false);
    }

    void Add(string name,Geometry geometry,Material material,bool shadows)
    {
        var mesh=geometry.Finish(name);owned.Add(mesh);
        var part=new GameObject(name);part.transform.SetParent(transform,false);part.AddComponent<MeshFilter>().sharedMesh=mesh;
        var renderer=part.AddComponent<MeshRenderer>();renderer.sharedMaterial=material;renderer.receiveShadows=true;
        renderer.shadowCastingMode=shadows?ShadowCastingMode.On:ShadowCastingMode.Off;
    }
    void OnDestroy() {foreach(var mesh in owned)if(mesh!=null)Destroy(mesh);}
}
