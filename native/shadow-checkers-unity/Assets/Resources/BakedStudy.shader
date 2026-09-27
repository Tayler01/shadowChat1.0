Shader "ShadowChat/BakedStudy" {
 Properties { _MainTex("Baked Cycles radiance",2D)="white"{} _Exposure("Exposure",Range(.5,2))=1 _WoodDetail("Walnut fibres",2D)="white"{} _WoodDetailStrength("Wood detail",Range(0,1))=.55 }
 SubShader { Tags {"RenderType"="Opaque"} LOD 100
  Pass {
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma target 3.0
   #pragma multi_compile_fog
   #include "UnityCG.cginc"
   struct appdata {float4 vertex:POSITION;float2 uv:TEXCOORD0;float2 detail:TEXCOORD1;fixed4 color:COLOR;};
   struct v2f {float4 pos:SV_POSITION;float2 uv:TEXCOORD0;float3 world:TEXCOORD1;float3 detail:TEXCOORD3;UNITY_FOG_COORDS(2)};
   sampler2D _MainTex,_WoodDetail;float _Exposure,_WoodDetailStrength;float4 _StudyRoomFlicker[6];
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.uv=v.uv;o.world=mul(unity_ObjectToWorld,v.vertex).xyz;o.detail=float3(v.detail,v.color.r);UNITY_TRANSFER_FOG(o,o.pos);return o;}
   fixed4 frag(v2f i):SV_Target {
    fixed4 c=tex2D(_MainTex,i.uv);float flicker=0;
    if(i.detail.z>.001 && _WoodDetailStrength>.001) {
     float fine=dot(tex2D(_WoodDetail,i.detail.xy).rgb,float3(.2126,.7152,.0722));
     float broad=dot(tex2Dbias(_WoodDetail,float4(i.detail.xy,0,5)).rgb,float3(.2126,.7152,.0722));
     // Restore fibres without multiplying in the photograph's dark tint twice.
     float grain=clamp(fine/max(broad,.002),.55,1.65);
     c.rgb*=lerp(1,grain,saturate(i.detail.z)*_WoodDetailStrength);
    }
    // Modulate the existing warm baked radiance rather than adding unoccluded
    // light to dark crevices. This approximates bounce; it is not realtime GI.
    [unroll] for(int source=0;source<6;source++) {
     float3 delta=i.world-_StudyRoomFlicker[source].xyz;
     float radius=source==0?70:22;
     float falloff=saturate(1-dot(delta,delta)/radius);
     flicker+=_StudyRoomFlicker[source].w*falloff*falloff*.7;
    }
    c.rgb*=_Exposure*(1+flicker*float3(1,.8,.55));
    UNITY_APPLY_FOG(i.fogCoord,c);return c;
   }
   ENDCG
  }
 } FallBack Off
}
