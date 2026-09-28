using UnityEngine;
using UnityEngine.Rendering;

public static class MedievalStudy
{
    static Material Surface(string name,Color tint,float metal,float polish,string texture=null)
    {
        var material=new Material(Resources.Load<Shader>("StudySurface"));material.name=name;material.color=tint;
        material.SetFloat("_Metallic",metal);material.SetFloat("_Glossiness",polish);
        if(texture!=null) material.mainTexture=Resources.Load<Texture2D>("Textures/"+texture);
        return material;
    }
    static void Detail(Transform parent,string name,Material material,bool shadows=true)
    {
        var source=Resources.Load<GameObject>("Models/"+name);
        if(source==null) throw new System.InvalidOperationException("Missing detailed study asset: "+name);
        var model=Object.Instantiate(source,parent);
        foreach(var renderer in model.GetComponentsInChildren<Renderer>()) {
            renderer.sharedMaterial=material;
            renderer.shadowCastingMode=shadows?ShadowCastingMode.On:ShadowCastingMode.Off;
            renderer.receiveShadows=true;
        }
    }
    public static void Build(Transform parent)
    {
        if(Resources.Load<GameObject>("Models/StudyArchitecture")==null) throw new System.InvalidOperationException("Baked study assets are missing");
        foreach(string name in new[]{"StudyArchitecture","StudyFurnishings"}) {
            var model=Object.Instantiate(Resources.Load<GameObject>("Models/"+name),parent);
            var material=new Material(Resources.Load<Shader>("BakedStudy"));
            material.mainTexture=Resources.Load<Texture2D>("Textures/"+name+"Lightmap");
            material.SetTexture("_WoodDetail",Resources.Load<Texture2D>("Textures/OakColor"));
            material.SetFloat("_Exposure",.95f);
            foreach(var renderer in model.GetComponentsInChildren<Renderer>()) {
                renderer.sharedMaterial=material;
                renderer.shadowCastingMode=ShadowCastingMode.Off;
                renderer.receiveShadows=false;
            }
        }
        RenderSettings.fog=false;
        var bindings=Surface("Tooled library leather",new Color(.85f,.85f,.85f),.03f,.38f,"BookSpines");
        var leatherGrain=Resources.Load<Texture2D>("Textures/LeatherRough");
        bindings.SetTexture("_LeatherGrain",leatherGrain);bindings.SetFloat("_LeatherWear",.65f);
        bindings.SetFloat("_Micrograin",.18f);Detail(parent,"StudyBindings",bindings,false);
        var brass=Surface("Engraved aged brass",new Color(.54f,.39f,.20f),.82f,.65f);
        brass.SetFloat("_Micrograin",.10f);Detail(parent,"StudyMetals",brass);
        var wood=Surface("Close walnut grain",new Color(.80f,.75f,.67f),0,.52f,"OakColor");
        wood.SetTexture("_NormalMap",Resources.Load<Texture2D>("Textures/OakNormal"));
        wood.SetTexture("_RoughMap",Resources.Load<Texture2D>("Textures/OakRough"));wood.SetFloat("_UseWoodMaps",1);
        Detail(parent,"StudyWood",wood);
        var paper=Surface("Layered vellum edges",new Color(.65f,.57f,.41f),0,.12f);paper.SetFloat("_PaperLines",1);
        Detail(parent,"StudyPaper",paper);
        var leather=Surface("Embossed folio leather",Color.white,0,.30f);leather.SetFloat("_Micrograin",.30f);leather.SetFloat("_LeatherWear",1);
        leather.SetTexture("_LeatherGrain",leatherGrain);
        Detail(parent,"StudyLeather",leather);
        var wax=new Material(Resources.Load<Shader>("StudyWax"));wax.name="Hand dipped beeswax";
        wax.color=new Color(.76f,.65f,.44f);wax.SetFloat("_Glossiness",.38f);
        wax.SetFloat("_Micrograin",.08f);wax.SetFloat("_WaxGlow",.055f);
        Detail(parent,"StudyWax",wax);
        Detail(parent,"StudyMaps",Surface("Engraved parchment",new Color(.9f,.85f,.74f),0,.13f,"StudyMap"));
        Detail(parent,"StudyWine",Surface("Wine in worked goblet",new Color(.065f,.008f,.014f),0,.94f),false);
        var ink=Surface("Glazed ink stoneware",new Color(.018f,.022f,.024f),.05f,.56f);ink.SetFloat("_Micrograin",.2f);
        Detail(parent,"StudyInk",ink);
        var stone=Surface("Fire-worn limestone",new Color(.46f,.44f,.40f),0,.14f,"HearthStoneColor");
        stone.SetTexture("_NormalMap",Resources.Load<Texture2D>("Textures/HearthStoneNormal"));
        stone.SetFloat("_UseWoodMaps",1);stone.SetFloat("_WoodNormalStrength",.65f);
        stone.SetFloat("_WoodRoughVariation",0);stone.SetFloat("_Micrograin",.16f);
        stone.SetFloat("_HearthSoot",1);
        Detail(parent,"StudyStone",stone);
        var chair=new GameObject("Old study armchair");chair.transform.SetParent(parent,false);
        chair.AddComponent<StudyChair>().Build(wood,leather,brass);
        var portrait=new GameObject("Old scholar portrait");portrait.transform.SetParent(parent,false);
        var painting=Surface("Aged oil and varnish",Color.white,0,.28f,"StudyPortrait");
        painting.SetFloat("_Micrograin",.10f);
        portrait.AddComponent<StudyPortrait>().Build(wood,brass,painting);
        parent.gameObject.AddComponent<MedievalStudyEffects>();
        parent.gameObject.AddComponent<StudyWindow>();

    }
}
