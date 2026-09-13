using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

public static class StudyDiagnostics
{
    [MenuItem("ShadowChat/Capture room details")]
    public static void CaptureDetails()
    {
        var board=Object.FindFirstObjectByType<ShadowBoard>();board.SetCamera("reset");
        var camera=GameObject.Find("Table Camera").GetComponent<Camera>();
        var target=camera.targetTexture;var rt=new RenderTexture(1280,720,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB);
        camera.targetTexture=rt;
        var points=new[]{new Vector3(10,3,7),new Vector3(-7,0,6)};
        for(int i=0;i<points.Length;i++) {
            camera.transform.position=points[i];camera.transform.LookAt(points[i]+new Vector3(0,0,7));camera.Render();
            var previous=RenderTexture.active;RenderTexture.active=rt;
            var image=new Texture2D(1280,720,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,1280,720),0,0);image.Apply();
            File.WriteAllBytes(Path.GetFullPath("../../output/playwright/shadow-checkers-unity/room-detail-"+i+".png"),image.EncodeToPNG());
            RenderTexture.active=previous;Object.DestroyImmediate(image);
        }
        camera.targetTexture=target;rt.Release();Object.DestroyImmediate(rt);board.SetCamera("reset");
    }
    [MenuItem("ShadowChat/Inspect study assets")]
    public static void Inspect()
    {
        var output=new StringBuilder();
        foreach(var name in new[]{"StudyBindings","StudyArchitecture","StudyFurnishings","StudyMetals"}) {
            var model=Object.Instantiate(Resources.Load<GameObject>("Models/"+name));
            foreach(var filter in model.GetComponentsInChildren<MeshFilter>()) {
                output.AppendLine(name+" transform "+filter.transform.localToWorldMatrix+" bounds "+filter.GetComponent<Renderer>().bounds);
                using(var data=Mesh.AcquireReadOnlyMeshData(filter.sharedMesh)) {
                    var vertices=new Unity.Collections.NativeArray<Vector3>(data[0].vertexCount,Unity.Collections.Allocator.Temp);
                    var normals=new Unity.Collections.NativeArray<Vector3>(data[0].vertexCount,Unity.Collections.Allocator.Temp);
                    data[0].GetVertices(vertices);data[0].GetNormals(normals);
                    if(name=="StudyBindings") for(int i=0;i<Mathf.Min(8,vertices.Length);i++) output.AppendLine("world "+filter.transform.TransformPoint(vertices[i])+" normal "+filter.transform.TransformDirection(normals[i]));
                    vertices.Dispose();normals.Dispose();
                }
            }
            Object.DestroyImmediate(model);
        }
        var texture=Resources.Load<Texture2D>("Textures/BookSpines");output.AppendLine("Book texture "+texture+" "+texture.width+"x"+texture.height);
        File.WriteAllText(Path.GetFullPath("../../output/study-asset-inspection.txt"),output.ToString());
    }
}
