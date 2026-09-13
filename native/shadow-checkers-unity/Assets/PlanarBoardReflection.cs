using UnityEngine;

// Real scene reflection on the board, at a bounded resolution for phone GPUs.
[RequireComponent(typeof(Camera))]
public class PlanarBoardReflection : MonoBehaviour
{
    Camera source, mirror;
    RenderTexture texture;
    bool rendering;
    void OnEnable() { source=GetComponent<Camera>(); }
    void OnPreCull()
    {
        if(rendering || source==null) return;
        if(mirror==null)
        {
            var o=new GameObject("Board reflection camera"); o.hideFlags=HideFlags.HideAndDontSave;
            mirror=o.AddComponent<Camera>(); mirror.enabled=false;
            int size=Screen.width>1000?1024:512;
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
    }
    void OnDisable()
    {
        if(mirror!=null) Destroy(mirror.gameObject);
        if(texture!=null) { texture.Release(); Destroy(texture); }
        Shader.SetGlobalFloat("_HasBoardReflection",0);
    }
}
