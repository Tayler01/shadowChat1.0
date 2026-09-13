Shader "ShadowChat/VeinedMarble"
{
    Properties {
        _Color ("Stone", Color) = (.03,.035,.045,1)
        _Vein ("Veins", Color) = (.7,.75,.82,1)
        _Metallic ("Metallic", Range(0,1)) = .25
        _Glossiness ("Polish", Range(0,1)) = .65
        _PlanarStrength ("Glass reflection", Range(0,1)) = 0
        _MainTex ("Marble surface", 2D) = "white" {}
        _UseTexture ("Use PBR surface", Range(0,1)) = 0
        _InvertMap ("Light marble variation", Range(0,1)) = 0
    }
    SubShader {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows
        #pragma target 3.0
        struct Input { float3 worldPos; float4 screenPos; float3 viewDir; float2 uv_MainTex; };
        fixed4 _Color, _Vein;
        half _Metallic, _Glossiness, _PlanarStrength, _UseTexture, _InvertMap;
        sampler2D _MainTex;
        sampler2D _BoardReflection;
        float _HasBoardReflection;
        float hash(float3 p) { return frac(sin(dot(p,float3(127.1,311.7,74.7)))*43758.5453); }
        float noise(float3 p) {
            float3 i=floor(p), f=frac(p); f=f*f*(3-2*f);
            return lerp(lerp(lerp(hash(i),hash(i+float3(1,0,0)),f.x),lerp(hash(i+float3(0,1,0)),hash(i+float3(1,1,0)),f.x),f.y),lerp(lerp(hash(i+float3(0,0,1)),hash(i+float3(1,0,1)),f.x),lerp(hash(i+float3(0,1,1)),hash(i+float3(1,1,1)),f.x),f.y),f.z);
        }
        void surf(Input IN, inout SurfaceOutputStandard o) {
            float3 p=mul(unity_WorldToObject,float4(IN.worldPos,1)).xyz;
            float warp=noise(p*2)*2+noise(p*5)*.7+noise(p*13)*.22;
            float veinDistance=abs(sin(p.x*5+p.z*3+p.y*4+warp*8));
            float vein=1-smoothstep(.01,.085,veinDistance);
            float haze=noise(p*22)*.018;
            o.Albedo=lerp(_Color.rgb+haze,_Vein.rgb,vein*.72);
            float3 stone=tex2D(_MainTex,IN.uv_MainTex).rgb;
            stone=lerp(stone,1-stone,_InvertMap);
            o.Albedo=lerp(o.Albedo,stone*_Color.rgb,_UseTexture);
            o.Metallic=_Metallic; o.Smoothness=_Glossiness; o.Alpha=1;
            float fresnel=pow(1-saturate(dot(normalize(IN.viewDir),float3(0,0,1))),3);
            float reflection=_PlanarStrength*_HasBoardReflection*(.22+.78*fresnel);
            o.Albedo*=1-reflection;
            o.Emission=tex2Dproj(_BoardReflection,UNITY_PROJ_COORD(IN.screenPos)).rgb*reflection;
        }
        ENDCG
    }
    FallBack "Standard"
}
