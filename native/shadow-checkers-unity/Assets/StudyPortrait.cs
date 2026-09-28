using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

// A static painting with actual recessed canvas and stepped frame geometry.
// Three small meshes reuse the room materials; no per-frame work or new light.
public sealed class StudyPortrait : MonoBehaviour
{
    readonly List<Mesh> owned = new List<Mesh>();
    Material canvasMaterial;

    public void Build(Material wood, Material brass, Material painting)
    {
        canvasMaterial = painting;
        // The wall battens project to X=-16.55; hang the frame in front of them.
        transform.localPosition = new Vector3(-16.40f, 3.2f, 3.6f);
        transform.localRotation = Quaternion.Euler(0, -90, 0);
        transform.localScale = new Vector3(1.13f, 1.10f, 1f);
        Frame("Carved walnut frame", wood, new[] {
            new Vector3(2.10f,3.00f,.12f), new Vector3(2.10f,3.00f,-.10f),
            new Vector3(2.06f,2.96f,-.17f), new Vector3(2.01f,2.91f,-.22f),
            new Vector3(1.97f,2.87f,-.25f), new Vector3(1.92f,2.82f,-.18f),
            new Vector3(1.86f,2.76f,-.13f)
        }, new Color(.48f,.35f,.24f));
        Frame("Aged brass sight edge", brass, new[] {
            new Vector3(1.87f,2.77f,-.13f), new Vector3(1.84f,2.74f,-.18f),
            new Vector3(1.80f,2.70f,-.07f)
        }, Color.white);
        Frame("Walnut beaded inner fillet", wood, new[] {
            new Vector3(1.92f,2.82f,-.19f), new Vector3(1.90f,2.80f,-.25f),
            new Vector3(1.87f,2.77f,-.16f)
        }, new Color(.62f,.49f,.34f));
        CornerCarving(wood);
        var mesh = new Mesh { name = "Recessed oil canvas" };
        mesh.vertices = new[] { new Vector3(-1.8f,-2.7f,-.065f), new Vector3(-1.8f,2.7f,-.065f),
            new Vector3(1.8f,2.7f,-.065f), new Vector3(1.8f,-2.7f,-.065f) };
        mesh.uv = new[] { Vector2.zero, Vector2.up, Vector2.one, Vector2.right };
        mesh.colors = new[] { Color.white, Color.white, Color.white, Color.white };
        mesh.triangles = new[] { 0,1,2,0,2,3 };
        Attach("A scholar at his desk", mesh, painting, false);
    }

    void Frame(string label, Material material, Vector3[] profile, Color tint)
    {
        var vertices = new List<Vector3>(); var uv = new List<Vector2>();
        var colors = new List<Color>(); var triangles = new List<int>();
        // Separate each molding band so the bevels keep their crisp normals.
        for(int band=0;band<profile.Length-1;band++) for(int side=0;side<4;side++) {
            var a=Corner(profile[band],side); var b=Corner(profile[band],(side+1)%4);
            var c=Corner(profile[band+1],(side+1)%4); var d=Corner(profile[band+1],side);
            int first=vertices.Count;
            foreach(var p in new[]{a,b,c,d}) {
                vertices.Add(p); uv.Add(new Vector2(p.x*.28f,p.y*.32f)); colors.Add(tint);
            }
            triangles.AddRange(new[]{first,first+1,first+2,first,first+2,first+3});
        }
        var mesh=new Mesh { name=label };
        mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetColors(colors);mesh.SetTriangles(triangles,0);
        Attach(label,mesh,material,true);
    }

    void CornerCarving(Material material)
    {
        var vertices=new List<Vector3>();var uv=new List<Vector2>();
        var colors=new List<Color>();var triangles=new List<int>();
        // Four restrained eight-leaf corner bosses sit on the broad outside
        // molding, with enough depth to survive the moving room camera.
        foreach(float x in new[]{-2.0f,2.0f})foreach(float y in new[]{-2.90f,2.90f}) {
            int center=vertices.Count;
            vertices.Add(new Vector3(x,y,-.28f));uv.Add(new Vector2(.5f,.5f));colors.Add(new Color(.69f,.54f,.36f));
            for(int petal=0;petal<8;petal++) {
                float a=petal*Mathf.PI/4f;
                vertices.Add(new Vector3(x+Mathf.Cos(a)*.083f,y+Mathf.Sin(a)*.083f,-.245f));
                uv.Add(new Vector2(.5f+Mathf.Cos(a)*.5f,.5f+Mathf.Sin(a)*.5f));
                colors.Add(new Color(.43f,.31f,.21f));
            }
            for(int petal=0;petal<8;petal++)
                triangles.AddRange(new[]{center,center+1+(petal+1)%8,center+1+petal});
        }
        var mesh=new Mesh {name="Carved corner flowers"};
        mesh.SetVertices(vertices);mesh.SetUVs(0,uv);mesh.SetColors(colors);mesh.SetTriangles(triangles,0);
        Attach("Carved corner flowers",mesh,material,true);
    }

    static Vector3 Corner(Vector3 p,int index)
    {
        return new Vector3(index<2?-p.x:p.x,index==0||index==3?-p.y:p.y,p.z);
    }

    void Attach(string label,Mesh mesh,Material material,bool shadows)
    {
        mesh.RecalculateNormals();mesh.RecalculateTangents();mesh.RecalculateBounds();owned.Add(mesh);
        var child=new GameObject(label);child.transform.SetParent(transform,false);
        child.AddComponent<MeshFilter>().sharedMesh=mesh;
        var renderer=child.AddComponent<MeshRenderer>();renderer.sharedMaterial=material;
        renderer.shadowCastingMode=shadows?ShadowCastingMode.On:ShadowCastingMode.Off;
        renderer.receiveShadows=true;
    }

    void OnDestroy()
    {
        foreach(var mesh in owned) if(mesh!=null) Destroy(mesh);
        if(canvasMaterial!=null) Destroy(canvasMaterial);
    }
}
