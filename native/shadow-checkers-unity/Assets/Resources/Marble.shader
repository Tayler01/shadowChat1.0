Shader "ShadowChat/VeinedMarble"
{
    Properties {
        _Color ("Stone", Color) = (.03,.035,.045,1)
        _Vein ("Veins", Color) = (.7,.75,.82,1)
        _Metallic ("Metallic", Range(0,1)) = .25
        _Glossiness ("Polish", Range(0,1)) = .65
        _PlanarStrength ("Glass reflection", Range(0,1)) = 0
        _MainTex ("Marble surface", 2D) = "white" {}
        _SurfaceUV ("Per-object stone cut", Vector) = (1,1,0,0)
        _UseTexture ("Use PBR surface", Range(0,1)) = 0
        _InvertMap ("Light marble variation", Range(0,1)) = 0
        _VeinRemap ("Tint photographic veins", Range(0,1)) = 0
        _VeinRange ("Vein contrast range", Vector) = (.008,.12,0,0)
        _PolishVariation ("Mineral polish variation", Range(0,.3)) = 0
        _StoneProjection ("Continuous solid stone cut", Range(0,1)) = 0
    }
    SubShader {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        // Generate the caster here so it shares the per-piece instancing
        // properties; the Standard fallback submits every piece separately.
        #pragma surface surf Standard fullforwardshadows addshadow
        #pragma target 3.0
        struct Input { float3 worldPos; float3 worldNormal; float4 screenPos; float2 uv_MainTex; };
        fixed4 _Color, _Vein;
        half _Metallic, _Glossiness, _PlanarStrength, _UseTexture, _InvertMap;
        half _VeinRemap, _PolishVariation, _StoneProjection;
        float4 _VeinRange;
        sampler2D _MainTex;
        sampler2D _BoardReflection;
        float _HasBoardReflection;
        UNITY_INSTANCING_BUFFER_START(StoneCuts)
            UNITY_DEFINE_INSTANCED_PROP(float4, _SurfaceUV)
        UNITY_INSTANCING_BUFFER_END(StoneCuts)
        float hash(float3 p) { return frac(sin(dot(p,float3(127.1,311.7,74.7)))*43758.5453); }
        float noise(float3 p) {
            float3 i=floor(p), f=frac(p); f=f*f*(3-2*f);
            return lerp(lerp(lerp(hash(i),hash(i+float3(1,0,0)),f.x),lerp(hash(i+float3(0,1,0)),hash(i+float3(1,1,0)),f.x),f.y),lerp(lerp(hash(i+float3(0,0,1)),hash(i+float3(1,0,1)),f.x),lerp(hash(i+float3(0,1,1)),hash(i+float3(1,1,1)),f.x),f.y),f.z);
        }
        void surf(Input IN, inout SurfaceOutputStandard o) {
            float vein=0;
            // Textured stone/leather skips the procedural noise work on phone GPUs.
            if(_UseTexture>.5) {
                float4 cut=UNITY_ACCESS_INSTANCED_PROP(StoneCuts,_SurfaceUV);
                float3 stone;
                if(_StoneProjection>.5) {
                    // Object-space projection follows the piece as it moves/turns.
                    // The same volume continues across its cap, waist and bevels.
                    // Reuse existing interpolants to stay within mobile SM3 limits.
                    float3 localPos=mul(unity_WorldToObject,float4(IN.worldPos,1)).xyz;
                    float3 localNormal=mul(IN.worldNormal,(float3x3)unity_ObjectToWorld);
                    float3 weights=pow(abs(localNormal),4);
                    weights/=max(dot(weights,1),.0001);
                    stone=tex2D(_MainTex,localPos.zy*cut.xy+cut.zw).rgb*weights.x
                        +tex2D(_MainTex,localPos.xz*cut.xy+cut.zw).rgb*weights.y
                        +tex2D(_MainTex,localPos.xy*cut.xy+cut.zw).rgb*weights.z;
                } else stone=tex2D(_MainTex,IN.uv_MainTex*cut.xy+cut.zw).rgb;
                vein=smoothstep(_VeinRange.x,_VeinRange.y,dot(stone,float3(.2126,.7152,.0722)));
                float3 tinted=lerp(_Color.rgb,_Vein.rgb,vein);
                stone=lerp(stone,1-stone,_InvertMap);
                o.Albedo=lerp(stone*_Color.rgb,tinted,_VeinRemap);
            } else {
                float3 p=mul(unity_WorldToObject,float4(IN.worldPos,1)).xyz;
                float warp=noise(p*2)*2+noise(p*5)*.7+noise(p*13)*.22;
                float veinDistance=abs(sin(p.x*5+p.z*3+p.y*4+warp*8));
                vein=1-smoothstep(.01,.085,veinDistance);
                float haze=noise(p*22)*.018;
                o.Albedo=lerp(_Color.rgb+haze,_Vein.rgb,vein*.72);
            }
            o.Metallic=_Metallic; o.Smoothness=saturate(_Glossiness-vein*_PolishVariation); o.Alpha=1;
            if(_PlanarStrength>.001 && _HasBoardReflection>.5) {
                float3 toCamera=normalize(_WorldSpaceCameraPos-IN.worldPos);
                float fresnel=pow(1-saturate(dot(toCamera,normalize(IN.worldNormal))),5);
                float reflection=_PlanarStrength*(.08+.92*fresnel);
                o.Albedo*=1-reflection;
                // Meta/shadow passes can supply a zero projection denominator.
                float2 reflectionUv=IN.screenPos.xy/max(IN.screenPos.w,.0001);
                o.Emission=tex2D(_BoardReflection,reflectionUv).rgb*reflection;
            }
        }
        ENDCG
    }
    FallBack "Standard"
}
