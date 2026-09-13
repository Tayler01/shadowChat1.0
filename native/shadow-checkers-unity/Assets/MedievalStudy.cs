using UnityEngine;
using UnityEngine.Rendering;

public static class MedievalStudy
{
    public static void Build(Transform parent)
    {
        if(Resources.Load<GameObject>("Models/StudyArchitecture")==null) throw new System.InvalidOperationException("Baked study assets are missing");
        foreach(string name in new[]{"StudyArchitecture","StudyFurnishings"}) {
            var model=Object.Instantiate(Resources.Load<GameObject>("Models/"+name),parent);
            var material=new Material(Resources.Load<Shader>("BakedStudy"));
            material.mainTexture=Resources.Load<Texture2D>("Textures/"+name+"Lightmap");
            foreach(var renderer in model.GetComponentsInChildren<Renderer>()) {
                renderer.sharedMaterial=material;
                renderer.shadowCastingMode=ShadowCastingMode.Off;
                renderer.receiveShadows=false;
            }
        }
        RenderSettings.fog=false;
        var bindings=Object.Instantiate(Resources.Load<GameObject>("Models/StudyBindings"),parent);
        var leather=new Material(Resources.Load<Shader>("Marble"));leather.mainTexture=Resources.Load<Texture2D>("Textures/BookSpines");
        leather.color=new Color(.55f,.47f,.36f);leather.SetFloat("_UseTexture",1);leather.SetFloat("_Metallic",.05f);leather.SetFloat("_Glossiness",.3f);
        foreach(var renderer in bindings.GetComponentsInChildren<Renderer>()) {renderer.sharedMaterial=leather;renderer.shadowCastingMode=ShadowCastingMode.Off;}
        var metalwork=Object.Instantiate(Resources.Load<GameObject>("Models/StudyMetals"),parent);
        var brass=new Material(Resources.Load<Shader>("Marble"));brass.color=new Color(.48f,.31f,.13f);brass.SetColor("_Vein",new Color(.37f,.23f,.08f));brass.SetFloat("_Metallic",.72f);brass.SetFloat("_Glossiness",.71f);
        foreach(var renderer in metalwork.GetComponentsInChildren<Renderer>()) {renderer.sharedMaterial=brass;renderer.shadowCastingMode=ShadowCastingMode.Off;}
        parent.gameObject.AddComponent<MedievalStudyEffects>();

    }
}
