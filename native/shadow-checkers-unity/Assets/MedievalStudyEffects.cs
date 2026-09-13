using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

public class MedievalStudyEffects : MonoBehaviour
{
    readonly List<Transform> flames=new List<Transform>();
    readonly List<Material> materials=new List<Material>();
    readonly List<Light> lights=new List<Light>();
    Mesh quad;float clock;bool paused,reducedMotion;
    public void Configure(bool reduced,bool hidden) {reducedMotion=reduced;paused=hidden;}
    void Awake()
    {
        quad=new Mesh {name="Study flame plane"};
        quad.vertices=new[]{new Vector3(-.5f,0,0),new Vector3(.5f,0,0),new Vector3(.5f,1,0),new Vector3(-.5f,1,0)};
        quad.uv=new[]{Vector2.zero,Vector2.right,Vector2.one,Vector2.up};quad.triangles=new[]{0,2,1,0,3,2};quad.RecalculateBounds();
        // The hearth sits beside the desk; its fire remains visible over the grate.
        Flame(new Vector3(-10.5f,-3.85f,12.8f),new Vector2(4.8f,5.8f),false,0);
        Flame(new Vector3(-11.8f,-3.85f,12.4f),new Vector2(2.4f,4.2f),false,2.6f);
        Flame(new Vector3(-9.15f,-3.85f,12.3f),new Vector2(2.2f,3.6f),false,5.1f);
        foreach(var p in new[]{new Vector3(7.6f,1.84f,-3.5f),new Vector3(-7.1f,1.44f,4.5f),new Vector3(-7.9f,1.09f,-5.8f),new Vector3(-8,4.9f,13.1f),new Vector3(-13.3f,4.45f,13.1f)}) Flame(p,new Vector2(.40f,.46f),true,p.x);
        AddLight(new Vector3(-10.5f,-.2f,11.6f),new Color(1,.47f,.19f),2.2f,16);
        AddLight(new Vector3(7.6f,2,-3.5f),new Color(1,.67f,.35f),1.1f,10);
        AddLight(new Vector3(-7.1f,1.6f,4.5f),new Color(1,.67f,.35f),1.1f,10);
    }
    void Flame(Vector3 position,Vector2 size,bool candle,float phase)
    {
        var obj=new GameObject(candle?"Living candle flame":"Living hearth fire");obj.transform.SetParent(transform);obj.transform.position=position;obj.transform.localScale=new Vector3(size.x,size.y,1);
        obj.AddComponent<MeshFilter>().sharedMesh=quad;
        var mat=new Material(Resources.Load<Shader>("StudyFlame"));mat.mainTexture=Resources.Load<Texture2D>("Textures/HearthFlames");mat.SetFloat("_Kind",candle?1:0);mat.SetFloat("_Phase",phase);mat.SetFloat("_Intensity",candle?1.5f:1.3f);
        materials.Add(mat);var renderer=obj.AddComponent<MeshRenderer>();renderer.sharedMaterial=mat;renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
        flames.Add(obj.transform);
    }
    void AddLight(Vector3 position,Color color,float intensity,float range)
    {
        var light=new GameObject("Gentle flame light").AddComponent<Light>();light.transform.SetParent(transform);light.transform.position=position;light.type=LightType.Point;light.color=color;light.intensity=intensity;light.range=range;light.shadows=LightShadows.None;lights.Add(light);
    }
    void LateUpdate()
    {
        if(!paused && !reducedMotion) clock+=Time.unscaledDeltaTime;
        Shader.SetGlobalFloat("_StudyTime",clock);
        var camera=Camera.main;
        if(camera!=null) foreach(var flame in flames) {var toward=camera.transform.position-flame.position;toward.y=0;if(toward.sqrMagnitude>.01f) flame.rotation=Quaternion.LookRotation(toward);}
        for(int i=0;i<lights.Count;i++) lights[i].intensity=(i==0?2.2f:1.1f)*(1+Mathf.Sin(clock*2.1f+i)*.035f+Mathf.Sin(clock*3.8f+i*2)*.018f);
    }
    void OnDestroy() {foreach(var material in materials) Destroy(material);Destroy(quad);}
}
