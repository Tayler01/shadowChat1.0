Shader "ShadowChat/StudyCharcoal"
{
    Properties { _MainTex("Charcoal coordinates",2D)="white"{} }
    SubShader {
        Tags { "RenderType"="Opaque" }
        LOD 100
        Pass {
        Tags { "LightMode"="ForwardBase" }
        CGPROGRAM
        #pragma vertex vert
        #pragma fragment frag
        #pragma target 3.0
        #include "UnityCG.cginc"
        #include "Lighting.cginc"
        struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;float2 uv:TEXCOORD0;fixed4 color:COLOR;};
        struct v2f {float4 position:SV_POSITION;float2 uv:TEXCOORD0;float3 worldPos:TEXCOORD1;half3 lighting:TEXCOORD2;fixed4 color:COLOR;};
        sampler2D _MainTex;
        float4 _MainTex_ST;
        float _StudyTime;
        float4 _StudyRoomFlicker[6];
        v2f vert(appdata v) {
            v2f o;o.position=UnityObjectToClipPos(v.vertex);o.uv=TRANSFORM_TEX(v.uv,_MainTex);
            o.worldPos=mul(unity_ObjectToWorld,v.vertex).xyz;o.color=v.color;
            float3 normal=UnityObjectToWorldNormal(v.normal);
            o.lighting=max(.06,ShadeSH9(float4(normal,1)))+_LightColor0.rgb*saturate(dot(normal,_WorldSpaceLightPos0.xyz));
            // Reuse the fire's position and energy without another render pass.
            // The dark bark should still catch the changing warm light above it.
            float3 toFire=_StudyRoomFlicker[0].xyz-o.worldPos;
            float distanceSq=max(.01,dot(toFire,toFire));
            float facing=saturate(dot(normal,toFire*rsqrt(distanceSq)));
            o.lighting+=float3(1,.47,.19)*(1+_StudyRoomFlicker[0].w)*2.2*facing/(1+distanceSq*.15);
            return o;
        }
        float2 cellPoint(float2 p) {
            return frac(sin(float2(dot(p,float2(127.1,311.7)),dot(p,float2(269.5,183.3))))*43758.5453);
        }
        float charSeam(float2 p) {
            float2 cell=floor(p),local=frac(p);float closest=8,next=8;
            for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++) {
                float2 offset=float2(x,y),delta=offset+.12+cellPoint(cell+offset)*.76-local;
                float distance=dot(delta,delta);
                next=min(next,max(closest,distance));closest=min(closest,distance);
            }
            return sqrt(next)-sqrt(closest);
        }
        float charNoise(float2 p) {
            float2 cell=floor(p),f=frac(p);f=f*f*(3-2*f);
            return lerp(lerp(cellPoint(cell).x,cellPoint(cell+float2(1,0)).x,f.x),
                lerp(cellPoint(cell+float2(0,1)).x,cellPoint(cell+1).x,f.x),f.y);
        }
        fixed4 frag(v2f IN):SV_Target {
            // Long irregular checks follow the wood fibres instead of outlining
            // every polygon with an equally bright, regular glowing network.
            float2 p=IN.uv*float2(.95,6.8);
            p+=float2(sin(p.y*2.1),sin(p.x*1.7))*.18;
            float width=max(length(ddx(p)),length(ddy(p)));
            float cracks=1-smoothstep(.012,.045+width*.35,charSeam(p));
            float mottle=charNoise(IN.uv*float2(.67,1.3)+IN.worldPos.z*.17);
            float endGrain=0;
            if(IN.color.b>.5) {
                float2 cut=(IN.uv-.5)*2;
                float rings=length(cut)*12+charNoise(cut*3)*.8;
                float ringWidth=max(fwidth(rings),.04);
                endGrain=(1-smoothstep(.035,.12+ringWidth,abs(frac(rings)-.5)))*.45;
                cracks*=.3;
            }
            float ash=(1-cracks)*mottle*IN.color.g;
            float grain=dot(tex2D(_MainTex,IN.uv*.35).rgb,float3(.2126,.7152,.0722));
            float3 charcoal=lerp(float3(.008,.007,.006),float3(.063,.057,.049),ash)*(.65+grain*2)*(1-endGrain);
            float breathing=.79+.13*sin(_StudyTime*.85+IN.worldPos.x*2.1)+.08*sin(_StudyTime*1.27+IN.worldPos.z*3);
            // Heat emerges from scattered fissures and the small ember bed;
            // most cracks in the large logs remain cool, black charcoal.
            float hotPatch=smoothstep(.38,.78,mottle);
            float glow=cracks*IN.color.r*breathing*hotPatch*(.25+.75*saturate(IN.color.r*1.5));
            return float4(charcoal*IN.lighting+float3(.72,.052,.003)*glow,1);
        }
        ENDCG
        }
    }
    FallBack Off
}
