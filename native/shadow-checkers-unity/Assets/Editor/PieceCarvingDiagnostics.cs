using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;

// Render the actual token assembly and game materials, not a separate art mockup.
public static class PieceCarvingDiagnostics
{
    [MenuItem("ShadowChat/Capture marble carvings")]
    public static void Capture()
    {
        if (!EditorApplication.isPlaying) throw new InvalidOperationException("Start Play mode before capturing actual piece materials");
        var board = UnityEngine.Object.FindFirstObjectByType<ShadowBoard>();
        if (board == null || GameObject.Find("Table Camera") == null)
            throw new InvalidOperationException("Wait for the game board to finish starting");
        var camera = GameObject.Find("Table Camera").GetComponent<Camera>();
        var flags = BindingFlags.Instance | BindingFlags.NonPublic;
        var tokenType = typeof(ShadowBoard).GetNestedType("Token", BindingFlags.NonPublic);
        var create = typeof(ShadowBoard).GetMethod("CreateTokenModel", flags);
        var existing = (IDictionary)typeof(ShadowBoard).GetField("tokens", flags).GetValue(board);
        var hidden = new List<GameObject>();
        var roots = new List<GameObject>();
        var oldPosition = camera.transform.position;
        var oldRotation = camera.transform.rotation;
        var oldFov = camera.fieldOfView;
        var oldTarget = camera.targetTexture;
        var oldActive = RenderTexture.active;
        var target = new RenderTexture(1200, 900, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
        try {
            foreach (var token in existing.Values) {
                var root = (GameObject)tokenType.GetField("root").GetValue(token);
                if (root.activeSelf) { hidden.Add(root); root.SetActive(false); }
            }
            for (int i = 0; i < 4; i++) {
                var root = new GameObject("Carving review " + i);
                roots.Add(root);
                root.transform.position = new Vector3(i % 2 == 0 ? -.60f : .60f, 0, i < 2 ? -.65f : .65f);
                var token = Activator.CreateInstance(tokenType);
                tokenType.GetField("root").SetValue(token, root);
                var piece = new ShadowBoard.Piece {
                    id = "crest-review-" + i, owner = i % 2 == 0 ? "player_one" : "player_two", king = i >= 2
                };
                create.Invoke(board, new object[] { token, piece });
            }
            camera.transform.position = new Vector3(0, 3.3f, -3.7f);
            camera.transform.LookAt(new Vector3(0, .21f, 0));
            camera.fieldOfView = 33;
            camera.targetTexture = target;
            camera.Render();
            RenderTexture.active = target;
            var image = new Texture2D(1200, 900, TextureFormat.RGB24, false);
            try {
                image.ReadPixels(new Rect(0, 0, 1200, 900), 0, 0);
                image.Apply();
                string path = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../output/checkers-marble-carvings-review.png"));
                File.WriteAllBytes(path, image.EncodeToPNG());
            } finally { UnityEngine.Object.DestroyImmediate(image); }
        } finally {
            camera.transform.position = oldPosition;
            camera.transform.rotation = oldRotation;
            camera.fieldOfView = oldFov;
            camera.targetTexture = oldTarget;
            RenderTexture.active = oldActive;
            target.Release();
            UnityEngine.Object.DestroyImmediate(target);
            foreach (var root in roots) UnityEngine.Object.DestroyImmediate(root);
            foreach (var root in hidden) if (root != null) root.SetActive(true);
        }
    }
}
