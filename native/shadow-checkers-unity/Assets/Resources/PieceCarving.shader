Shader "ShadowChat/PieceCarving"
{
    Properties {
        _Color ("Perimeter glow hue", Color) = (1,1,1,1)
        _Base ("Silver relief", Color) = (.76,.8,.86,1)
        _Glow ("Outer circumference glow", Range(0,2)) = 1
    }
    SubShader {
        Tags { "RenderType"="Opaque" }
        LOD 150
        CGPROGRAM
        // Tiny token relief uses the key light, ambient and reflections without
        // adding a separate draw for every candle affecting every checker.
        #pragma surface surf Standard fullforwardshadows addshadow noforwardadd
        #pragma target 3.0
        #pragma multi_compile_instancing
        struct Input { fixed4 color : COLOR; };
        fixed4 _Color, _Base;
        half _Glow;
        void surf(Input IN, inout SurfaceOutputStandard o) {
            float rimGlow = saturate(IN.color.a);
            o.Albedo = _Base.rgb * IN.color.rgb;
            o.Metallic = .66;
            o.Smoothness = .66;
            o.Alpha = 1;
            o.Emission = _Color.rgb * _Glow * IN.color.rgb * rimGlow;
        }
        ENDCG
    }
    FallBack "Standard"
}
