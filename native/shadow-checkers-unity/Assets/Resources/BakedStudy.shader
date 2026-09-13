Shader "ShadowChat/BakedStudy" {
 Properties { _MainTex("Baked Cycles radiance",2D)="white"{} _Exposure("Exposure",Range(.5,2))=1 }
 SubShader { Tags {"RenderType"="Opaque"} LOD 100
  Pass {
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #pragma multi_compile_fog
   #include "UnityCG.cginc"
   struct appdata {float4 vertex:POSITION;float2 uv:TEXCOORD0;};
   struct v2f {float4 pos:SV_POSITION;float2 uv:TEXCOORD0;UNITY_FOG_COORDS(1)};
   sampler2D _MainTex;float _Exposure;
   v2f vert(appdata v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.uv=v.uv;UNITY_TRANSFER_FOG(o,o.pos);return o;}
   fixed4 frag(v2f i):SV_Target {fixed4 c=tex2D(_MainTex,i.uv);c.rgb*=_Exposure;UNITY_APPLY_FOG(i.fogCoord,c);return c;}
   ENDCG
  }
 } FallBack Off
}
