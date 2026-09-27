using System.Collections.Generic;
using UnityEngine;

// One static mesh/material for the fuel bed. No particles, per-ember objects,
// extra lights or downloaded textures; the fire clock also pauses its glow.
public static class StudyHearth
{
    public static Mesh CreateMesh()
    {
        var vertices=new List<Vector3>();var uv=new List<Vector2>();
        var colors=new List<Color>();var triangles=new List<int>();
        for(int log=0;log<3;log++)
            Log(vertices,uv,colors,triangles,new Vector3(-10.5f,-3.8f,12.6f+log*.6f),3.86f,.30f,log,.12f);
        // A partly consumed upper split log makes the stack less mechanical.
        Log(vertices,uv,colors,triangles,new Vector3(-10.35f,-3.42f,13.05f),2.75f,.22f,4,.23f);
        var random=new System.Random(1587);
        for(int ember=0;ember<42;ember++) {
            float x=-12.7f+(float)random.NextDouble()*4.4f;
            float z=12.23f+(float)random.NextDouble()*1.75f;
            float size=.08f+(float)random.NextDouble()*.13f;
            Log(vertices,uv,colors,triangles,new Vector3(x,-4.14f+size*.5f,z),size*2,size,ember+7,.55f+(float)random.NextDouble()*.45f,2,8);
        }
        var mesh=new Mesh {name="Charred oak and embers (combined)"};
        mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetColors(colors);mesh.SetTriangles(triangles,0);
        mesh.RecalculateNormals();mesh.RecalculateBounds();mesh.UploadMeshData(true);return mesh;
    }

    static void Log(List<Vector3> vertices,List<Vector2> uv,List<Color> colors,List<int> triangles,Vector3 center,float length,float radius,int seed,float heat,int rings=12,int sides=16)
    {
        int first=vertices.Count;
        for(int ring=0;ring<=rings;ring++) for(int side=0;side<=sides;side++) {
            float u=(float)ring/rings,v=(float)side/sides,a=v*Mathf.PI*2;
            float edge=(ring==0||ring==rings)?.82f:1;
            float r=radius*edge*(1+.08f*Mathf.Sin(a*5+seed)+.035f*Mathf.Sin(u*17+seed));
            var p=new Vector3((u-.5f)*length,Mathf.Cos(a)*r,Mathf.Sin(a)*r);
            p.y+=Mathf.Sin(u*Mathf.PI)*radius*.08f;
            if(seed==4)p=Quaternion.Euler(0,14,4)*p;
            vertices.Add(center+p);uv.Add(new Vector2(u*length*2+seed*1.731f,v*3));
            colors.Add(new Color(heat,.65f+.35f*Mathf.Sin(a+seed)*Mathf.Sin(a+seed),0,1));
            if(ring<rings&&side<sides) {
                int i=first+ring*(sides+1)+side;
                triangles.AddRange(new[]{i,i+1,i+sides+1,i+1,i+sides+2,i+sides+1});
            }
        }
        // Separate cap vertices keep cut-end grain radial and the end normals
        // flat. Reusing bark UVs stretched bright stripes across the whole cut.
        for(int end=0;end<2;end++) {
            int cap=vertices.Count,start=first+end*rings*(sides+1);
            Vector3 midpoint=Vector3.zero;
            for(int side=0;side<sides;side++)midpoint+=vertices[start+side];
            vertices.Add(midpoint/sides);uv.Add(new Vector2(.5f,.5f));colors.Add(new Color(heat*.25f,.8f,1,1));
            int rim=vertices.Count;
            for(int side=0;side<sides;side++) {
                float angle=side*Mathf.PI*2/sides;
                vertices.Add(vertices[start+side]);
                uv.Add(new Vector2(.5f+Mathf.Cos(angle)*.5f,.5f+Mathf.Sin(angle)*.5f));
                colors.Add(new Color(heat*.25f,.8f,1,1));
            }
            for(int side=0;side<sides;side++) {
                triangles.Add(cap);triangles.Add(rim+(side+(end==0?1:0))%sides);triangles.Add(rim+(side+(end==0?0:1))%sides);
            }
        }
    }
}
