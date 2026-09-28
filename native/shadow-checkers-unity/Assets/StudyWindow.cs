using UnityEngine;
using UnityEngine.Rendering;
using System.Collections.Generic;

// A framed night view with shallow exterior depth and tapered bare branches.
// No additional light, shadow map, texture download or animation is required.
public sealed class StudyWindow : MonoBehaviour
{
    Material glass;
    Material bark;
    Mesh branches;
    void Awake()
    {
        glass=new Material(Resources.Load<Shader>("StudyWindow"));
        glass.name="Moonlit hand-blown window glass";
        var pane=GameObject.CreatePrimitive(PrimitiveType.Quad);
        pane.name="Luminous study window";
        pane.transform.SetParent(transform,false);
        // FBX export mirrors the Blender study's horizontal coordinate.
        pane.transform.localPosition=new Vector3(3.9f,4.15f,14.72f);
        pane.transform.localScale=new Vector3(3.8f,10.3f,1);
        Destroy(pane.GetComponent<Collider>());
        var renderer=pane.GetComponent<Renderer>();
        renderer.sharedMaterial=glass;
        renderer.shadowCastingMode=ShadowCastingMode.Off;
        renderer.receiveShadows=false;
        CreateBranches();
    }
    void CreateBranches()
    {
        var vertices=new List<Vector3>();var indices=new List<int>();
        var paths=new[]{
            new[]{new Vector3(2.30f,-1.8f,14.43f),new Vector3(2.80f,1.6f,14.42f),new Vector3(3,3.2f,14.46f),new Vector3(2.85f,5,14.48f),new Vector3(3.2f,6.9f,14.51f),new Vector3(3.15f,9.6f,14.56f)},
            new[]{new Vector3(3,3.2f,14.46f),new Vector3(4,4.6f,14.50f),new Vector3(4.75f,5.65f,14.54f),new Vector3(5.4f,6.9f,14.57f)},
            new[]{new Vector3(4,4.6f,14.50f),new Vector3(4.3f,6.05f,14.57f),new Vector3(4.02f,6.9f,14.60f)},
            new[]{new Vector3(2.8f,1.6f,14.42f),new Vector3(3.7f,2.3f,14.35f),new Vector3(4.55f,2.55f,14.32f),new Vector3(5.45f,3.6f,14.28f)},
            new[]{new Vector3(3.7f,2.3f,14.35f),new Vector3(3.8f,3.2f,14.32f),new Vector3(4.1f,3.8f,14.30f)},
            new[]{new Vector3(2.85f,5,14.48f),new Vector3(2.3f,6.1f,14.53f),new Vector3(2.05f,7.4f,14.55f)},
            new[]{new Vector3(3.2f,6.9f,14.51f),new Vector3(4.15f,7.6f,14.53f),new Vector3(4.95f,8.85f,14.56f)},
            new[]{new Vector3(3.7f,7.23f,14.52f),new Vector3(3.55f,8.4f,14.6f),new Vector3(3.80f,9.2f,14.63f)},
            new[]{new Vector3(4.75f,5.65f,14.54f),new Vector3(5.15f,5.85f,14.54f),new Vector3(5.62f,5.72f,14.52f)},
            new[]{new Vector3(4.3f,6.05f,14.57f),new Vector3(4.72f,6.3f,14.56f),new Vector3(5.02f,6.2f,14.55f)},
            new[]{new Vector3(2.3f,6.1f,14.53f),new Vector3(1.97f,6.28f,14.55f),new Vector3(1.78f,6.72f,14.57f)},
            new[]{new Vector3(4.55f,2.55f,14.32f),new Vector3(4.76f,3.10f,14.36f),new Vector3(4.68f,3.48f,14.39f)},
            new[]{new Vector3(3.15f,9.6f,14.56f),new Vector3(2.93f,10.08f,14.59f),new Vector3(2.55f,10.3f,14.62f)}
        };
        for(int path=0;path<paths.Length;path++) {
            var points=paths[path];float root=path==0?.085f:path==1||path==3?.05f:path<8?.028f:.016f;
            int segments=(points.Length-1)*4;
            for(int segment=0;segment<segments;segment++) {
                var a=BranchPoint(points,segment/4f);var b=BranchPoint(points,(segment+1)/4f);var axis=(b-a).normalized;
                var u=Vector3.Cross(axis,Vector3.forward).normalized;var v=Vector3.Cross(axis,u);
                int first=vertices.Count;
                for(int end=0;end<2;end++)for(int side=0;side<8;side++) {
                    float angle=side*Mathf.PI/4;
                    float radius=Mathf.Lerp(root,.007f,(segment+end)/(float)segments);
                    vertices.Add((end==0?a:b)+(u*Mathf.Cos(angle)+v*Mathf.Sin(angle))*radius);
                }
                for(int side=0;side<8;side++) {
                    int next=(side+1)%8;
                    indices.AddRange(new[]{first+side,first+next,first+side+8,first+next,first+next+8,first+side+8});
                }
                for(int side=1;side<7;side++)indices.AddRange(new[]{first,first+side+1,first+side,first+8,first+side+8,first+side+9});
            }
        }
        branches=new Mesh {name="Exterior bare oak branches"};branches.SetVertices(vertices);branches.SetTriangles(indices,0);branches.RecalculateBounds();
        var tree=new GameObject("Bare branches beyond the window");tree.transform.SetParent(transform,false);tree.AddComponent<MeshFilter>().sharedMesh=branches;
        bark=new Material(glass);bark.name="Distant oak silhouette";bark.SetFloat("_Branch",1);
        var renderer=tree.AddComponent<MeshRenderer>();renderer.sharedMaterial=bark;renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
    }
    static Vector3 BranchPoint(Vector3[] points,float progress)
    {
        int i=Mathf.Min(points.Length-2,Mathf.FloorToInt(progress));float t=progress-i;
        var b=points[i];var c=points[i+1];var a=i>0?points[i-1]:2*b-c;var d=i+2<points.Length?points[i+2]:2*c-b;
        return .5f*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
    }
    void OnDestroy() {if(glass!=null) Destroy(glass);if(bark!=null)Destroy(bark);if(branches!=null)Destroy(branches);}
}
