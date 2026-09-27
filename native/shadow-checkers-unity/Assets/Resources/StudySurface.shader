Shader "ShadowChat/StudySurface"
{
    Properties {
        _Color ("Surface tint", Color) = (1,1,1,1)
        _MainTex ("Surface photograph", 2D) = "white" {}
        _NormalMap ("Wood grain normal", 2D) = "bump" {}
        _RoughMap ("Wood roughness", 2D) = "white" {}
        _UseWoodMaps ("Use wood PBR maps", Range(0,1)) = 0
        _WoodNormalStrength ("Wood grain relief", Range(0,1)) = .18
        _WoodRoughVariation ("Wood finish variation", Range(0,1)) = .24
        _Metallic ("Metal", Range(0,1)) = 0
        _Glossiness ("Polish", Range(0,1)) = .4
        _Micrograin ("Fine surface variation", Range(0,1)) = 0
        _PaperLines ("Layered paper edges", Range(0,1)) = 0
        _WaxGlow ("Warm wax scattering approximation", Range(0,.2)) = 0
        _LeatherWear ("Leather pores and mottling", Range(0,1)) = 0
        _LeatherGrain ("Photographed leather grain", 2D) = "gray" {}
        _HearthSoot ("Localized chimney soot", Range(0,1)) = 0
    }
    SubShader {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows
        #pragma target 3.0
        struct Input { float2 uv_MainTex; float3 worldPos; fixed4 color : COLOR; };
        sampler2D _MainTex, _NormalMap, _RoughMap, _LeatherGrain;
        fixed4 _Color;
        half _Metallic, _Glossiness, _UseWoodMaps, _Micrograin, _PaperLines, _WaxGlow, _LeatherWear;
        half _WoodNormalStrength, _WoodRoughVariation;
        half _HearthSoot;
        float surfaceNoise(float2 p) {
            float2 cell=floor(p),f=frac(p); f=f*f*(3-2*f);
            float4 seeds=float4(dot(cell,float2(127.1,311.7)),dot(cell+float2(1,0),float2(127.1,311.7)),dot(cell+float2(0,1),float2(127.1,311.7)),dot(cell+1,float2(127.1,311.7)));
            float4 values=frac(sin(seeds)*43758.5453);
            return lerp(lerp(values.x,values.y,f.x),lerp(values.z,values.w,f.x),f.y);
        }
        void surf(Input IN, inout SurfaceOutputStandard o) {
            o.Albedo=tex2D(_MainTex,IN.uv_MainTex).rgb*_Color.rgb*IN.color.rgb;
            o.Metallic=_Metallic; o.Smoothness=_Glossiness; o.Alpha=1;
            if(_UseWoodMaps>.5) {
                float3 normal=UnpackNormal(tex2D(_NormalMap,IN.uv_MainTex));
                o.Normal=normalize(float3(normal.xy*_WoodNormalStrength,normal.z));
                // Preserve the material's finish instead of replacing it with
                // near-mirror gloss wherever the roughness photograph is dark.
                float roughness=tex2D(_RoughMap,IN.uv_MainTex).r;
                o.Smoothness=saturate(_Glossiness+(.5-roughness)*_WoodRoughVariation);
            }
            if(_HearthSoot>.001) {
                float3 p=IN.worldPos;
                float center=(p.x+10.5)/2.25;
                float plume=exp(-center*center)*saturate((p.y+3.3)/4.4);
                float back=smoothstep(13.1,13.8,p.z);
                float mottling=.8+.2*surfaceNoise(p.xy*3.7);
                o.Albedo*=1-plume*back*mottling*.92*_HearthSoot;
                o.Smoothness*=1-plume*back*.6;
            }
            if(_Micrograin>.001) {
                float3 p=IN.worldPos*150;
                float grain=surfaceNoise(p.xz+p.y*float2(.31,.73))-.5;
                float visibility=1-saturate(max(length(ddx(p)),length(ddy(p)))*.4);
                o.Smoothness=saturate(o.Smoothness+grain*_Micrograin*visibility);
                o.Albedo*=1+grain*_Micrograin*.15*visibility;
            }
            if(_LeatherWear>.001) {
                float2 p=IN.worldPos.xz+IN.worldPos.y*float2(.31,.73);
                float wear=surfaceNoise(p*3);
                // Spatial mapping also covers the rounded folios that have no
                // UV atlas. Mip filtering keeps distant library grain stable.
                float grain=tex2D(_LeatherGrain,p*.72).r-.5;
                o.Albedo*=lerp(1,.65+wear*.5,_LeatherWear);
                o.Albedo*=1+grain*.55*_LeatherWear;
                o.Smoothness=saturate(o.Smoothness+((wear-.5)*.15-grain*.55)*_LeatherWear);
            }
            if(_PaperLines>.5) {
                float paperPhase=IN.worldPos.y*850;
                float visibility=1-saturate(fwidth(paperPhase));
                o.Albedo*=1-.12*(.5+.5*sin(paperPhase))*visibility;
            }
            o.Emission=_Color.rgb*float3(1,.48,.13)*IN.color.a*_WaxGlow;
        }
        ENDCG
    }
    FallBack "Standard"
}
