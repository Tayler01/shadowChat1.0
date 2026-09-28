Shader "ShadowChat/StudyWax"
{
    Properties {
        _Color ("Aged beeswax", Color) = (1,1,1,1)
        _Glossiness ("Wax sheen", Range(0,1)) = .38
        _WaxGlow ("Warm scattering", Range(0,.2)) = .055
        _Micrograin ("Fine surface variation", Range(0,1)) = .08
    }
    SubShader {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows vertex:vert addshadow
        #pragma target 3.0
        struct Input { float3 worldPos; fixed4 color : COLOR; };
        fixed4 _Color;
        half _Glossiness, _WaxGlow, _Micrograin;
        float _StudyTime;

        void vert(inout appdata_full v) {
            // UV0.x=-1 marks only modeled drips; alpha still controls wax glow.
            // UV0.y leaves the attached upper end still as the lower end grows.
            float drip=(1-step(-.5,v.texcoord.x))*saturate(1-v.texcoord.y);
            // FBX axes and scale differ from the study's world coordinates.
            // Grow down by a bounded world-space distance, never mesh-local Y.
            float4 world=mul(unity_ObjectToWorld,v.vertex);
            float2 cell=floor((world.xz+1.1)*.2);
            float delay=35+85*frac(sin(dot(cell,float2(37.7,91.3)))*43758.5453);
            float growth=saturate((_StudyTime-delay)/210);
            world.y-=drip*growth*.105;
            v.vertex=mul(unity_WorldToObject,world);
        }

        void surf(Input IN, inout SurfaceOutputStandard o) {
            float phaseA=IN.worldPos.y*74+IN.worldPos.x*29;
            float phaseB=IN.worldPos.z*38-IN.worldPos.y*11;
            float detail=1-saturate(max(fwidth(phaseA),fwidth(phaseB))*.32);
            float grain=sin(phaseA)*sin(phaseB)*detail;
            o.Albedo=_Color.rgb*IN.color.rgb*(1+grain*_Micrograin*.045);
            o.Metallic=0;
            o.Smoothness=saturate(_Glossiness+grain*_Micrograin*.06);
            o.Alpha=1;
            o.Emission=_Color.rgb*float3(1,.48,.13)*_WaxGlow*IN.color.a;
        }
        ENDCG
    }
    FallBack "Standard"
}
