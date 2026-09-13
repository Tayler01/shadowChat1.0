Shader "ShadowChat/AncientOak" {
 Properties { _Color("Oak",Color)=(1,1,1,1) _MainTex("Wood photograph",2D)="white"{} _BumpMap("Wood normals",2D)="bump"{} _Roughness("Roughness",2D)="white"{} }
 SubShader {
  Tags {"RenderType"="Opaque"} LOD 200
  CGPROGRAM
  #pragma surface surf Standard fullforwardshadows
  #pragma target 3.0
  struct Input {float3 worldPos;float3 worldNormal; INTERNAL_DATA}; fixed4 _Color;
  sampler2D _MainTex,_BumpMap,_Roughness;
  void surf(Input IN,inout SurfaceOutputStandard o) {
   float3 p=IN.worldPos;
   float3 n=abs(WorldNormalVector(IN,float3(0,0,1)));
   float2 uv=n.y>.5?p.xz/8:n.x>.5?p.zy/8:p.xy/8;
   o.Albedo=tex2D(_MainTex,uv).rgb*_Color.rgb;
   o.Normal=UnpackNormal(tex2D(_BumpMap,uv));
   o.Metallic=.02; o.Smoothness=(1-tex2D(_Roughness,uv).r)*.55; o.Alpha=1;
  }
  ENDCG
 } FallBack "Diffuse"
}
