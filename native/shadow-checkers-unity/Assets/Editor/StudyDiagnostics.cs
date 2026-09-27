using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

public static class StudyDiagnostics
{
    [MenuItem("ShadowChat/Capture foreground details")]
    public static void CaptureForeground()
    {
        var board=Object.FindFirstObjectByType<ShadowBoard>();board.SetCamera("reset");
        var camera=GameObject.Find("Table Camera").GetComponent<Camera>();
        var target=camera.targetTexture;var active=RenderTexture.active;
        var rt=new RenderTexture(960,640,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB);
        var names=new[]{"folios","wax","goblet","parchment","library","armillary","ink","wall-map"};
        var positions=new[]{new Vector3(8.8f,2.4f,.4f),new Vector3(9.4f,3.1f,-5.4f),new Vector3(-7,1.4f,-4.3f),new Vector3(4.8f,3,-8.7f),new Vector3(11.5f,3,10.5f),new Vector3(-5,3,3.5f),new Vector3(8.3f,.6f,-5.5f),new Vector3(-1.6f,4.25f,6.5f)};
        var targets=new[]{new Vector3(7.8f,0,3.2f),new Vector3(7.6f,.7f,-3.5f),new Vector3(-8.2f,0,-2.7f),new Vector3(7.1f,-.9f,-5.6f),new Vector3(12,3,14),new Vector3(-7.1f,1.1f,5.8f),new Vector3(7.1f,-.65f,-4),new Vector3(-1.6f,4.25f,14.5f)};
        string directory=Path.GetFullPath("../../output/playwright/shadow-checkers-unity/foreground-native");Directory.CreateDirectory(directory);
        try {
            camera.targetTexture=rt;
            for(int i=0;i<names.Length;i++) {
                camera.transform.position=positions[i];camera.transform.LookAt(targets[i]);
                Object.FindFirstObjectByType<MedievalStudyEffects>().FaceFlames(camera);
                camera.Render();RenderTexture.active=rt;
                var image=new Texture2D(960,640,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,960,640),0,0);image.Apply();
                File.WriteAllBytes(Path.Combine(directory,names[i]+".png"),image.EncodeToPNG());Object.DestroyImmediate(image);
            }
        } finally {camera.targetTexture=target;RenderTexture.active=active;rt.Release();Object.DestroyImmediate(rt);board.SetCamera("reset");}
    }
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
