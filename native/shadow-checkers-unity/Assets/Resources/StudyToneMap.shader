Shader "ShadowChat/StudyToneMap"
{
    Properties { _MainTex("Scene radiance",2D)="white"{} }
    SubShader {
        Cull Off ZWrite Off ZTest Always
        Pass {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            // Krzysztof Narkowicz's CC0 ACES curve fit:
            // https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
            half4 frag(v2f_img i):SV_Target {
                half4 scene=tex2D(_MainTex,i.uv);
                float3 x=clamp(scene.rgb,0,32);
                float3 mapped=saturate((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14));
                // Retain the baked room's low-light detail instead of crushing
                // already-dark shelves and leather through a second toe curve.
                float weight=smoothstep(.04,.18,dot(x,float3(.2126,.7152,.0722)));
                scene.rgb=lerp(saturate(x),mapped,weight);
                return scene;
            }
            ENDCG
        }
    }
    FallBack Off
}
