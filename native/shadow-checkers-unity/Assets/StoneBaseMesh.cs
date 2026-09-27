using System.Collections.Generic;
using UnityEngine;

public static class StoneBaseMesh
{
    // Actual dimensions preserve object-space marble proportions; six rounded
    // face grids provide a small edge highlight with only 96 vertices.
    public static Mesh Create(Vector3 size,float bevel)
    {
        var extent=size*.5f;
        var inner=extent-Vector3.one*bevel;
        var vertices=new List<Vector3>(96);var normals=new List<Vector3>(96);
        var uv=new List<Vector2>(96);var indices=new List<int>(324);
        foreach(var normal in new[]{Vector3.right,Vector3.left,Vector3.up,Vector3.down,Vector3.forward,Vector3.back}) {
            var u=Mathf.Abs(normal.x)>.5f?Vector3.forward:Vector3.right;
            var v=Vector3.Cross(normal,u);
            float eu=Vector3.Scale(extent,u).magnitude,ev=Vector3.Scale(extent,v).magnitude;
            var us=new[]{-eu,-eu+bevel,eu-bevel,eu};
            var vs=new[]{-ev,-ev+bevel,ev-bevel,ev};
            int start=vertices.Count;
            for(int y=0;y<4;y++)for(int x=0;x<4;x++) {
                var point=Vector3.Scale(normal,extent)+u*us[x]+v*vs[y];
                var core=new Vector3(Mathf.Clamp(point.x,-inner.x,inner.x),Mathf.Clamp(point.y,-inner.y,inner.y),Mathf.Clamp(point.z,-inner.z,inner.z));
                var direction=(point-core).normalized;
                vertices.Add(core+direction*bevel);normals.Add(direction);uv.Add(new Vector2(x/3f,y/3f));
            }
            for(int y=0;y<3;y++)for(int x=0;x<3;x++) {
                int a=start+y*4+x,b=a+1,c=a+4,d=c+1;
                indices.Add(a);indices.Add(b);indices.Add(d);
                indices.Add(a);indices.Add(d);indices.Add(c);
            }
        }
        var mesh=new Mesh {name="Beveled solid marble plinth"};
        mesh.SetVertices(vertices);mesh.SetNormals(normals);mesh.SetUVs(0,uv);mesh.SetTriangles(indices,0);mesh.RecalculateBounds();
        return mesh;
    }
}
