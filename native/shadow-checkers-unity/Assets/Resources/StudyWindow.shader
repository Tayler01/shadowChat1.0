Shader "ShadowChat/StudyWindow"
{
    Properties { _Branch ("Exterior branch silhouette", Float) = 0 }
    SubShader {
        Tags { "RenderType"="Opaque" }
        Pass {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            struct Input { float4 vertex:POSITION; float2 uv:TEXCOORD0; };
            half _Branch;
            struct Varying { float4 position:SV_POSITION; float2 uv:TEXCOORD0; float3 world:TEXCOORD1; };
            Varying vert(Input v) {
                Varying o; o.position=UnityObjectToClipPos(v.vertex); o.uv=v.uv; o.world=mul(unity_ObjectToWorld,v.vertex).xyz; return o;
            }
            half4 frag(Varying i):SV_Target {
                // Clip exterior geometry at the actual opening, including from
                // oblique tour views. This keeps branches behind the wall casing.
                float3 ray=i.world-_WorldSpaceCameraPos;
                float distance=(14.15-_WorldSpaceCameraPos.z)/(abs(ray.z)>.0001?ray.z:.0001);
                float2 opening=(_WorldSpaceCameraPos+ray*distance).xy-float2(3.9,4.15);
                clip(float2(1.30,4.65)-abs(opening));
                if(_Branch>.5) return half4(lerp(float3(.006,.011,.018),float3(.017,.026,.039),saturate((i.world.z-14.25)*2)),1);
                float2 uv=float2(opening.x/2.6+.5,opening.y/9.3+.5);
                // Small optical distortions and soot accumulate near the leadwork.
                float wave=sin(uv.x*19+sin(uv.y*37))*sin(uv.y*53+uv.x*9);
                float height=saturate(uv.y+wave*.009);
                float3 sky=lerp(float3(.015,.028,.05),float3(.075,.12,.19),smoothstep(.05,.95,height));
                float2 edge=min(uv,1-uv);
                float grime=smoothstep(0,.07,min(edge.x,edge.y*3.58));
                sky*=lerp(.65,1,grime)*(1+wave*.02);
                return half4(sky,1);
            }
            ENDCG
        }
    }
}
