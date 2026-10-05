using UnityEngine;

// Real scene reflection on the board, at a bounded resolution for phone GPUs.
[RequireComponent(typeof(Camera))]
public class PlanarBoardReflection : MonoBehaviour
{
    Camera source, mirror;
    RenderTexture texture;
    bool rendering;
    float nextRefresh;
    Matrix4x4 reflectedView, reflectedProjection;
    readonly Plane[] viewPlanes=new Plane[6];
    // Only the two tile meshes sample this texture. Include their bevels and
    // a small margin so reflection rendering resumes before an edge is visible.
    static readonly Bounds reflectiveBoard=new Bounds(new Vector3(0,.175f,0),new Vector3(8.3f,.3f,8.3f));
    bool BoardInView()
    {
        GeometryUtility.CalculateFrustumPlanes(source,viewPlanes);
        return GeometryUtility.TestPlanesAABB(viewPlanes,reflectiveBoard);
    }
    void OnEnable() { source=GetComponent<Camera>(); }
    void OnPreCull()
    {
        if(rendering || source==null) return;
        if(!BoardInView()) {
            Shader.SetGlobalFloat("_HasBoardReflection",0);
            nextRefresh=0;
            return;
        }
        // Camera motion needs a fresh reflection immediately. At rest, flames
        // and moving pieces still refresh at 30 Hz while the main view runs 60 Hz.
        if(texture!=null && Time.unscaledTime<nextRefresh &&
           source.worldToCameraMatrix==reflectedView && source.projectionMatrix==reflectedProjection) {
            Shader.SetGlobalTexture("_BoardReflection",texture);
            Shader.SetGlobalFloat("_HasBoardReflection",1);
            return;
        }
        if(mirror==null)
        {
            var o=new GameObject("Board reflection camera"); o.hideFlags=HideFlags.HideAndDontSave;
            mirror=o.AddComponent<Camera>(); mirror.enabled=false;
            const int size=512;
            texture=new RenderTexture(size,size,16,RenderTextureFormat.ARGB32); texture.name="Actual board reflection";
        }
        rendering=true;
        mirror.CopyFrom(source); mirror.enabled=false; mirror.targetTexture=texture;
        mirror.cullingMask=source.cullingMask & ~(1<<8);
        mirror.allowMSAA=false;
        const float height=.175f;
        var reflection=Matrix4x4.identity; reflection.m11=-1; reflection.m13=2*height;
        var pos=source.transform.position; pos.y=2*height-pos.y;
        mirror.transform.position=pos;
        mirror.worldToCameraMatrix=source.worldToCameraMatrix*reflection;
        var point=mirror.worldToCameraMatrix.MultiplyPoint(new Vector3(0,height+.005f,0));
        var normal=mirror.worldToCameraMatrix.MultiplyVector(Vector3.up).normalized;
        var clip=new Vector4(normal.x,normal.y,normal.z,-Vector3.Dot(point,normal));
        mirror.projectionMatrix=source.CalculateObliqueMatrix(clip);
        bool previous=GL.invertCulling;
        try { GL.invertCulling=!previous; Shader.SetGlobalFloat("_HasBoardReflection",0); mirror.Render(); }
        finally { GL.invertCulling=previous; rendering=false; }
        Shader.SetGlobalTexture("_BoardReflection",texture);
        Shader.SetGlobalFloat("_HasBoardReflection",1);
        reflectedView=source.worldToCameraMatrix;reflectedProjection=source.projectionMatrix;
        nextRefresh=Time.unscaledTime+1f/30;
    }
    void OnDisable()
    {
        if(mirror!=null) Destroy(mirror.gameObject);
        if(texture!=null) { texture.Release(); Destroy(texture); }
        nextRefresh=0;
        Shader.SetGlobalFloat("_HasBoardReflection",0);
    }
}
