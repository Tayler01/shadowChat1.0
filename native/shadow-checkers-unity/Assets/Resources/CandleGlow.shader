Shader "ShadowChat/CandleGlow" {
 Properties { _Color("Color",Color)=(1,.65,.24,1) }
 SubShader { Tags {"RenderType"="Opaque"} Pass {
 CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 fixed4 _Color;
 struct input { float4 vertex:POSITION; };
 struct output { float4 vertex:SV_POSITION; };
 output vert(input v) { output o;o.vertex=UnityObjectToClipPos(v.vertex);return o; }
 fixed4 frag(output i):SV_Target {return _Color;}
 ENDCG
 } }
}
