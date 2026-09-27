Shader "ShadowChat/StudyFlame"
{
    Properties { _MainTex("Fire frames",2D)="black"{} _Kind("Candle",Float)=0 _Phase("Phase",Float)=0 _Intensity("Glow",Float)=1 _Flicker("Shared flame and light energy",Float)=1 _Sway("Shared flame and light lean",Vector)=(0,0,0,0) }
    SubShader {
        Tags {"Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True"}
        Blend One OneMinusSrcAlpha
        ZWrite Off
        Cull Off
        Pass {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            struct appdata {float4 vertex:POSITION;float2 uv:TEXCOORD0;};
            struct v2f {float4 vertex:SV_POSITION;float2 uv:TEXCOORD0;};
            sampler2D _MainTex;float _Kind,_Phase,_Intensity,_StudyTime,_Flicker;float4 _Sway;
            v2f vert(appdata v) {v2f o;o.vertex=UnityObjectToClipPos(v.vertex);o.uv=v.uv;return o;}
            float3 frame(float2 uv,float index) {
                float2 tile=float2(fmod(index,4),1-floor(index/4));
                return tex2D(_MainTex,(tile+clamp(uv,.002,.998))/float2(4,2)).rgb;
            }
            fixed4 frag(v2f i):SV_Target {
                float t=_StudyTime+_Phase;float2 uv=i.uv;
                if(_Kind>.5) {
                    uv.y/=lerp(1,_Flicker,.45);
                    float y=uv.y;float center=.5+_Sway.x*y*y+_Sway.y*y;
                    float width=.19*pow(max(0,sin(y*3.14159)),.72)*(1-.6*y);
                    float d=abs(uv.x-center)/max(.004,width);
                    float edge=1-smoothstep(.65,1,d);
                    float envelope=smoothstep(0,.05,y)*(1-smoothstep(.84,1,y));
                    float core=(1-smoothstep(.04,.8,d))*(1-smoothstep(.3,.82,y));
                    float3 color=lerp(float3(1,.30,.045),float3(1,.86,.48),core);
                    color=lerp(float3(.12,.20,.8),color,smoothstep(.015,.14,y));
                    return float4(color*edge*envelope*_Intensity*_Flicker,0);
                }
                uv.x+=sin(uv.y*15-t*3.2)*.009*uv.y;
                float position=fmod(t*9,8);float index=floor(position);
                float blend=smoothstep(0,1,frac(position));
                float3 fire=lerp(frame(uv,index),frame(uv,fmod(index+1,8)),blend);
                // Premultiplied fire attenuates the layers behind its bright
                // core; black atlas pixels stay completely transparent.
                float opacity=saturate(dot(fire,float3(.2126,.7152,.0722))*.72);
                return float4(fire*_Intensity,opacity);
            }
            ENDCG
        }
    }
}
