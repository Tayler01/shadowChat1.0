using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

public class MedievalStudyEffects : MonoBehaviour
{
    readonly List<Transform> flames=new List<Transform>();
    readonly List<Material> materials=new List<Material>();
    readonly List<Light> lights=new List<Light>();
    readonly List<Material> flameMaterials=new List<Material>();
    readonly List<float> phases=new List<float>();
    // Mean linear luminance of the eight atlas frames, in shader playback order.
    static readonly float[] fireEnergy={.05032428f,.05847893f,.05832806f,.06428558f,.05825381f,.06081240f,.06365429f,.05771127f};
    readonly Vector4[] roomFlicker=new Vector4[6];
    Mesh quad,hearth;float clock;bool paused,reducedMotion;
    public void Configure(bool reduced,bool hidden) {reducedMotion=reduced;paused=hidden;}
    void Awake()
    {
        quad=new Mesh {name="Study flame plane"};
        quad.vertices=new[]{new Vector3(-.5f,0,0),new Vector3(.5f,0,0),new Vector3(.5f,1,0),new Vector3(-.5f,1,0)};
        quad.uv=new[]{Vector2.zero,Vector2.right,Vector2.one,Vector2.up};quad.triangles=new[]{0,2,1,0,3,2};quad.RecalculateBounds();
        // A fire seated in its fuel bed: staggered tongues leave the charred
        // wood visible instead of filling the entire fireplace with one flare.
        hearth=StudyHearth.CreateMesh();
        var fuel=new GameObject("Charred oak and banked embers");fuel.transform.SetParent(transform,false);
        fuel.AddComponent<MeshFilter>().sharedMesh=hearth;
        var charcoal=new Material(Resources.Load<Shader>("StudyCharcoal"));
        charcoal.mainTexture=Resources.Load<Texture2D>("Textures/OakColor");materials.Add(charcoal);
        var fuelRenderer=fuel.AddComponent<MeshRenderer>();fuelRenderer.sharedMaterial=charcoal;
        fuelRenderer.shadowCastingMode=ShadowCastingMode.Off;fuelRenderer.receiveShadows=true;
        Flame(new Vector3(-10.5f,-3.55f,13.35f),new Vector2(3.4f,3.6f),false,0);
        Flame(new Vector3(-11.65f,-3.48f,12.85f),new Vector2(1.85f,2.5f),false,2.6f);
        Flame(new Vector3(-9.45f,-3.47f,12.65f),new Vector2(1.65f,2.15f),false,5.1f);
        foreach(var p in new[]{new Vector3(7.6f,1.815f,-3.5f),new Vector3(-7.1f,1.415f,4.5f),new Vector3(-7.9f,1.065f,-5.8f),new Vector3(-8,4.9f,13.1f),new Vector3(-13.3f,4.45f,13.1f)}) Flame(p,new Vector2(.40f,.46f),true,p.x);
        AddLight(new Vector3(-10.5f,-.2f,11.6f),new Color(1,.47f,.19f),2.2f,16);
        AddLight(new Vector3(7.6f,2,-3.5f),new Color(1,.67f,.35f),1.45f,10);
        AddLight(new Vector3(-7.1f,1.6f,4.5f),new Color(1,.67f,.35f),1.45f,10);
        AddLight(new Vector3(-7.9f,1.25f,-5.8f),new Color(1,.67f,.35f),1.1f,8);
        AddLight(new Vector3(-8,5.085f,13.1f),new Color(1,.67f,.35f),.75f,6);
        AddLight(new Vector3(-13.3f,4.635f,13.1f),new Color(1,.67f,.35f),.75f,6);
        // One nearby candle provides moving contact shadows. Distant candles
        // remain vertex lights rather than adding five more shadow cubemaps.
        lights[1].renderMode=LightRenderMode.ForcePixel;
        lights[1].shadows=LightShadows.Soft;lights[1].shadowCustomResolution=128;
        lights[1].shadowNearPlane=.08f;lights[1].shadowBias=.035f;lights[1].shadowNormalBias=.12f;
    }
    void Flame(Vector3 position,Vector2 size,bool candle,float phase)
    {
        var obj=new GameObject(candle?"Living candle flame":"Living hearth fire");obj.transform.SetParent(transform);obj.transform.position=position;obj.transform.localScale=new Vector3(size.x,size.y,1);
        obj.AddComponent<MeshFilter>().sharedMesh=quad;
        var mat=new Material(Resources.Load<Shader>("StudyFlame"));mat.mainTexture=Resources.Load<Texture2D>("Textures/HearthFlames");mat.SetFloat("_Kind",candle?1:0);mat.SetFloat("_Phase",phase);mat.SetFloat("_Intensity",candle?1.5f:1.05f);
        materials.Add(mat);var renderer=obj.AddComponent<MeshRenderer>();renderer.sharedMaterial=mat;renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
        flames.Add(obj.transform);
        flameMaterials.Add(mat);phases.Add(phase);
    }
    void AddLight(Vector3 position,Color color,float intensity,float range)
    {
        var light=new GameObject("Gentle flame light").AddComponent<Light>();light.transform.SetParent(transform);light.transform.position=position;light.type=LightType.Point;light.color=color;light.intensity=intensity;light.range=range;light.shadows=LightShadows.None;
        if(lights.Count>=2)light.renderMode=LightRenderMode.ForceVertex;
        lights.Add(light);
    }
    void LateUpdate()
    {
        if(!paused && !reducedMotion) clock+=Mathf.Min(Time.unscaledDeltaTime,.05f);
        Shader.SetGlobalFloat("_StudyTime",clock);
        FaceFlames(Camera.main);
        // Match the same frame interpolation and phases used by the visible fire.
        lights[0].intensity=2.2f*(FireEnergy(clock)*.65f+FireEnergy(clock+2.6f)*.23f+FireEnergy(clock+5.1f)*.12f);
        for(int i=3;i<flameMaterials.Count;i++) {
            float phase=phases[i],t=clock+phase;
            float pulse=1+Mathf.Sin(t*2.7f+phase)*.045f+Mathf.Sin(t*4.1f)*.022f+Mathf.Sin(t*7.3f+phase)*.009f;
            flameMaterials[i].SetFloat("_Flicker",pulse);
            var sway=new Vector4(Mathf.Sin(t*2.7f+phase)*.055f,Mathf.Sin(t*4.1f)*.018f,0,0);
            flameMaterials[i].SetVector("_Sway",sway);
            int index=i-2;float baseline=index<3?1.45f:index==3?1.1f:.75f;
            // The shader changes both radiance and flame height. Integrate
            // both so the cast light follows its total visible glow.
            float heightScale=Mathf.Lerp(1,pulse,.45f);
            lights[index].intensity=baseline*pulse*heightScale;
            // Follow the bright body of the same flame, including its lean and
            // height change. Tiny source movement gives the nearby shadow its
            // natural sway without an unrelated random shadow animation.
            // Optical readback places the rendered luminous centroid at 44% height.
            const float luminousHeight=.44f;
            lights[index].transform.position=flames[i].TransformPoint(new Vector3(
                sway.x*luminousHeight*luminousHeight+sway.y*luminousHeight,
                luminousHeight*heightScale,0));
        }
        for(int i=0;i<lights.Count;i++) {
            var p=lights[i].transform.position;float baseline=i==0?2.2f:i<3?1.45f:i==3?1.1f:.75f;
            roomFlicker[i]=new Vector4(p.x,p.y,p.z,lights[i].intensity/baseline-1);
        }
        Shader.SetGlobalVectorArray("_StudyRoomFlicker",roomFlicker);
    }
    static float FireEnergy(float time)
    {
        float position=Mathf.Repeat(time*9,8);int index=Mathf.FloorToInt(position);
        return Mathf.Lerp(fireEnergy[index],fireEnergy[(index+1)%8],Mathf.SmoothStep(0,1,position-index))/.05898108f;
    }
    public void FaceFlames(Camera camera)
    {
        if(camera!=null) foreach(var flame in flames) {var toward=camera.transform.position-flame.position;toward.y=0;if(toward.sqrMagnitude>.01f) flame.rotation=Quaternion.LookRotation(toward);}
    }
    void OnDestroy() {foreach(var material in materials) Destroy(material);Destroy(quad);Destroy(hearth);}
}
