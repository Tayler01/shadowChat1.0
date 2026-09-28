using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

// Low relief metalwork on the existing marble caps. All tokens of a rank share
// one mesh; each faction shares one instanced material. No lights or textures.
public static class PieceCarvings
{
    static Mesh regular, king;
    static Material silverBlue, darkGold;
    static Color Tone(float value) { return new Color(value, value, value, 0); }

    sealed class Geometry
    {
        readonly List<Vector3> vertices = new List<Vector3>();
        readonly List<Color> colors = new List<Color>();
        readonly List<int> triangles = new List<int>();

        public void Relief(Vector2[] outline, float bottom, float top, Color shade)
        {
            int first = vertices.Count;
            Vector2 center = Vector2.zero;
            foreach (var point in outline) center += point;
            center /= outline.Length;
            float signedArea = 0;
            for (int i = 0; i < outline.Length; i++) {
                var a = outline[i]; var b = outline[(i + 1) % outline.Length];
                signedArea += a.x * b.y - b.x * a.y;
            }
            // Three rings make a real bevel and raised face, not a flat decal.
            for (int ring = 0; ring < 3; ring++) {
                float inset = ring == 0 ? 1f : ring == 1 ? .91f : .83f;
                float height = ring == 0 ? bottom : ring == 1 ? top - .005f : top;
                Color tint = shade * (ring == 0 ? .53f : ring == 1 ? .82f : 1f);
                tint.a = shade.a;
                for (int i = 0; i < outline.Length; i++) {
                    var point = outline[signedArea > 0 ? outline.Length - 1 - i : i];
                    Vector2 p = center + (point - center) * inset;
                    vertices.Add(new Vector3(p.x, height, p.y));
                    colors.Add(tint);
                }
            }
            int count = outline.Length;
            for (int ring = 0; ring < 2; ring++) for (int i = 0; i < count; i++) {
                int a = first + ring * count + i, b = first + ring * count + (i + 1) % count;
                triangles.AddRange(new[] { a, b, a + count, b, b + count, a + count });
            }
            int middle = vertices.Count;
            vertices.Add(new Vector3(center.x, top + .001f, center.y));
            colors.Add(shade);
            for (int i = 0; i < count; i++)
                triangles.AddRange(new[] { middle, first + 2 * count + i, first + 2 * count + (i + 1) % count });
        }

        public void Bar(Vector2 center, float length, float width, float angle, float bottom, float top, Color tint)
        {
            Vector2 along = new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * length * .5f;
            Vector2 across = new Vector2(-Mathf.Sin(angle), Mathf.Cos(angle)) * width * .5f;
            Relief(new[] { center - along - across, center + along - across,
                center + along + across, center - along + across }, bottom, top, tint);
        }

        public void Diamond(Vector2 center, float radius, float bottom, float top, Color tint)
        {
            Relief(new[] { center + Vector2.up * radius, center + Vector2.right * radius * .75f,
                center - Vector2.up * radius, center - Vector2.right * radius * .75f }, bottom, top, tint);
        }

        public void Stroke(Vector2[] path, float width, float bottom, float top, Color tint, bool closed = false)
        {
            for (int i = 0; i < path.Length - (closed ? 0 : 1); i++) {
                Vector2 a = path[i], b = path[(i + 1) % path.Length];
                Vector2 delta = b - a;
                Bar((a + b) * .5f, delta.magnitude + width * .25f, width,
                    Mathf.Atan2(delta.y, delta.x), bottom, top, tint);
            }
        }

        public void Rim(float y)
        {
            const int segments = 32;
            int first = vertices.Count;
            for (int ring = 0; ring < 3; ring++) {
                float radius = ring == 0 ? .292f : ring == 1 ? .307f : .296f;
                float height = y + (ring == 1 ? .003f : ring == 2 ? .012f : 0f);
                for (int i = 0; i < segments; i++) {
                    float a = i * Mathf.PI * 2 / segments;
                    vertices.Add(new Vector3(Mathf.Cos(a) * radius, height, Mathf.Sin(a) * radius));
                    // Only the narrow outside edge carries the faction glow.
                    Color tint = Tone(ring == 1 ? .62f : .93f);
                    tint.a = ring == 1 ? .7f : 0f;
                    colors.Add(tint);
                }
            }
            for (int ring = 0; ring < 2; ring++) for (int i = 0; i < segments; i++) {
                int a = first + ring * segments + i, b = first + ring * segments + (i + 1) % segments;
                triangles.AddRange(new[] { a, a + segments, b, b, a + segments, b + segments });
            }
        }

        public Mesh Finish(string name)
        {
            var mesh = new Mesh { name = name };
            mesh.SetVertices(vertices); mesh.SetColors(colors); mesh.SetTriangles(triangles, 0);
            mesh.RecalculateNormals(); mesh.RecalculateBounds(); mesh.UploadMeshData(true);
            return mesh;
        }
    }

    static Mesh CreateRegular()
    {
        var g = new Geometry();
        g.Rim(.293f);
        // The marble remains visible inside a fine chased shield outline.
        g.Bar(Vector2.zero, .43f, .014f, .80f, .274f, .289f, Tone(.62f));
        g.Bar(Vector2.zero, .43f, .014f, 2.34f, .274f, .289f, Tone(.62f));
        g.Bar(new Vector2(-.125f, -.128f), .085f, .012f, -.80f, .285f, .299f, Tone(.9f));
        g.Bar(new Vector2(.125f, -.128f), .085f, .012f, .80f, .285f, .299f, Tone(.9f));
        var shield = new[] { new Vector2(-.18f,.17f), new Vector2(0,.195f), new Vector2(.18f,.17f),
            new Vector2(.17f,-.045f), new Vector2(.10f,-.17f), new Vector2(0,-.235f),
            new Vector2(-.10f,-.17f), new Vector2(-.17f,-.045f) };
        g.Stroke(shield, .026f, .279f, .302f, Tone(.88f), true);
        var inset = new Vector2[shield.Length];
        for (int i = 0; i < shield.Length; i++) inset[i] = shield[i] * .79f + Vector2.up * .014f;
        g.Stroke(inset, .009f, .281f, .295f, Tone(.58f), true);
        var star = new Vector2[16];
        for (int i = 0; i < star.Length; i++) {
            float a = i * Mathf.PI / 8;
            float r = i % 2 == 0 ? .090f : .025f;
            star[i] = new Vector2(Mathf.Sin(a) * r, Mathf.Cos(a) * r - .012f);
        }
        g.Relief(star, .285f, .311f, Tone(.91f));
        foreach (var point in new[] { Vector2.up, Vector2.down, Vector2.left, Vector2.right })
            g.Diamond(point * .303f, .022f, .278f, .295f, Tone(.94f));
        return g.Finish("Carved shield and compass star");
    }

    static Mesh CreateKing()
    {
        var g = new Geometry();
        g.Rim(.517f);
        // Scalloped, open metalwork follows the crown points. The marble cap
        // shows through every valley instead of becoming a solid plaque.
        g.Stroke(new[] {
            new Vector2(-.20f,-.12f), new Vector2(-.20f,.055f),
            new Vector2(-.17f,.035f), new Vector2(-.145f,.006f), new Vector2(-.11f,.012f),
            new Vector2(-.085f,.11f), new Vector2(-.052f,.047f), new Vector2(-.025f,.054f),
            new Vector2(0,.215f), new Vector2(.025f,.054f), new Vector2(.052f,.047f),
            new Vector2(.085f,.11f), new Vector2(.11f,.012f), new Vector2(.145f,.006f),
            new Vector2(.17f,.035f), new Vector2(.20f,.055f), new Vector2(.20f,-.12f)
        }, .019f, .505f, .532f, Tone(.88f));
        g.Bar(new Vector2(0,-.105f), .40f, .025f, 0, .508f, .536f, Tone(.92f));
        g.Bar(new Vector2(0,-.145f), .36f, .010f, 0, .505f, .520f, Tone(.55f));
        foreach (var tip in new[] { new Vector2(-.20f,.055f), new Vector2(-.085f,.11f),
            new Vector2(0,.215f), new Vector2(.085f,.11f), new Vector2(.20f,.055f) })
            g.Diamond(tip, tip.x == 0 ? .026f : .018f, .524f, .549f, Tone(.96f));
        g.Diamond(new Vector2(0,-.073f), .047f, .536f, .561f, Tone(.97f));
        foreach (var point in new[] { Vector2.up, Vector2.down, Vector2.left, Vector2.right })
            g.Diamond(point * .303f, .023f, .502f, .519f, Tone(.94f));
        return g.Finish("Raised heraldic crown");
    }

    static Material Finish(string name, Color color, Color baseMetal, float glow)
    {
        // A serialized instanced material retains the player's instancing variant;
        // setting the flag only on runtime-created materials can strip it at build.
        var material = new Material(Resources.Load<Material>("InstancedPieceCarving"));
        material.name = name; material.color = color;
        material.SetColor("_Base", baseMetal);
        material.SetFloat("_Glow", glow); material.enableInstancing = true;
        return material;
    }

    public static Bounds Attach(Transform tokenRoot, bool isKing, bool isSilver)
    {
        if (regular == null) regular = CreateRegular();
        if (king == null) king = CreateKing();
        if (silverBlue == null) silverBlue = Finish("Silver relief with blue perimeter glow",
            new Color(.20f,.47f,.84f), new Color(.76f,.80f,.86f), 1.4f);
        if (darkGold == null) darkGold = Finish("Silver relief with gold perimeter glow",
            new Color(.95f,.58f,.20f), new Color(.76f,.80f,.86f), 1.1f);
        var child = new GameObject(isKing ? "Carved crown relief" : "Carved shield relief");
        child.transform.SetParent(tokenRoot, false);
        child.transform.localPosition = Vector3.down * .025f;
        child.layer = 9; // the board's moving-piece reflection layer
        Mesh mesh = isKing ? king : regular;
        child.AddComponent<MeshFilter>().sharedMesh = mesh;
        var renderer = child.AddComponent<MeshRenderer>();
        renderer.sharedMaterial = isSilver ? silverBlue : darkGold;
        renderer.shadowCastingMode = ShadowCastingMode.Off;
        renderer.receiveShadows = true;
        var bounds = mesh.bounds;
        bounds.center += child.transform.localPosition;
        return bounds;
    }

    public static void Dispose()
    {
        if (regular != null) Object.Destroy(regular); regular = null;
        if (king != null) Object.Destroy(king); king = null;
        if (silverBlue != null) Object.Destroy(silverBlue); silverBlue = null;
        if (darkGold != null) Object.Destroy(darkGold); darkGold = null;
    }
}
