using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using MCPForUnity.Editor.Services;

[InitializeOnLoad]
public static class ShadowCheckersBuild
{
    [Serializable] class WebManifest {public string loaderUrl,dataUrl,frameworkUrl,codeUrl;}
    static ShadowCheckersBuild()
    {
        if(!Application.isBatchMode) EditorApplication.delayCall+=StartBridge;
    }
    static async void StartBridge()
    {
        EditorPrefs.SetBool("MCPForUnity.TelemetryDisabled",true);
        EditorConfigurationCache.Instance.SetUseHttpTransport(false);
        try { await MCPServiceLocator.Bridge.StartAsync(); } catch(Exception e) { Debug.LogWarning(e.Message); }
    }
    [MenuItem("ShadowChat/Create game scene")]
    public static void CreateScene()
    {
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        new GameObject("ShadowBoard").AddComponent<ShadowBoard>();
        Directory.CreateDirectory("Assets/Scenes");
        EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene(),"Assets/Scenes/ShadowCheckers.unity");
        AssetDatabase.SaveAssets();
    }
    [MenuItem("ShadowChat/Build Web")]
    public static void BuildWebFromMenu()
    {
        SessionState.EraseString("ShadowCheckersBuildRequest");
        BuildWeb();
    }
    public static void BuildWeb()
    {
        // MCP can retry a long command after its response times out. Keep the
        // request guard inside the build entry point, across assembly reloads.
        // A deliberate retry uses a new request id; menu/batch builds need none.
        string request=SessionState.GetString("ShadowCheckersBuildRequest","");
        if(request.Length>0) {
            if(SessionState.GetString("ShadowCheckersBuildStarted","")==request) return;
            SessionState.SetString("ShadowCheckersBuildStarted",request);
        }
        string statusRoot=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../output/shadow-checkers-unity"));
        Directory.CreateDirectory(statusRoot);string marker=Path.Combine(statusRoot,"build.running");
        File.WriteAllText(marker,DateTime.UtcNow.ToString("O"));
        try {
        foreach(var path in Directory.GetFiles("Assets/Resources/Textures","*.jpg"))
            AssetDatabase.ImportAsset(path.Replace('\\','/'),ImportAssetOptions.ForceUpdate);
        foreach(var path in Directory.GetFiles("Assets/Resources/Textures","*.png"))
            AssetDatabase.ImportAsset(path.Replace('\\','/'),ImportAssetOptions.ForceUpdate);
        foreach(var path in Directory.GetFiles("Assets/Resources/Models","*.fbx"))
            AssetDatabase.ImportAsset(path.Replace('\\','/'),ImportAssetOptions.ForceUpdate);
        CreateScene();
        foreach(var shader in Resources.LoadAll<Shader>(""))
            if(ShaderUtil.ShaderHasError(shader)) throw new Exception("Shader compilation failed: "+shader.name);
        PlayerSettings.companyName="ShadowChat";
        PlayerSettings.productName="Shadow Checkers";
        PlayerSettings.colorSpace=ColorSpace.Linear;
        // Lossless delivery compression keeps the detailed study within the app
        // download budget. Retain fallback for local previews without CDN headers.
        PlayerSettings.WebGL.compressionFormat=WebGLCompressionFormat.Brotli;
        PlayerSettings.WebGL.decompressionFallback=true;
        // Unity 6 Personal permits an optional splash. The host already supplies
        // the themed loading screen, so avoid a second splash and its texture.
        PlayerSettings.SplashScreen.show=false;
        PlayerSettings.SplashScreen.showUnityLogo=false;
        PlayerSettings.WebGL.nameFilesAsHashes=true;
        PlayerSettings.WebGL.initialMemorySize=64;
        PlayerSettings.WebGL.maximumMemorySize=256;
        PlayerSettings.WebGL.powerPreference=WebGLPowerPreference.LowPower;
        PlayerSettings.runInBackground=false;
        QualitySettings.shadows=ShadowQuality.All;
        QualitySettings.shadowResolution=ShadowResolution.Medium;
        QualitySettings.shadowDistance=25;
        QualitySettings.antiAliasing=2;
        // Standard shader is referenced from code; keep it through player stripping.
        var graphics=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset")[0]);
        var shaders=graphics.FindProperty("m_AlwaysIncludedShaders");
        var standard=Shader.Find("Standard"); bool found=false;
        for(int i=0;i<shaders.arraySize;i++) if(shaders.GetArrayElementAtIndex(i).objectReferenceValue==standard) found=true;
        if(!found) { shaders.InsertArrayElementAtIndex(shaders.arraySize); shaders.GetArrayElementAtIndex(shaders.arraySize-1).objectReferenceValue=standard; graphics.ApplyModifiedProperties(); }
        string root=Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
        string destination=Path.Combine(root,"public/games/shadow-checkers/unity");
        var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions {scenes=new[]{"Assets/Scenes/ShadowCheckers.unity"},target=BuildTarget.WebGL,locationPathName=destination,options=BuildOptions.None});
        PublishWebManifest(report);
        } finally {File.Delete(marker);}
    }

    // Can finish a successful compilation if a file lock interrupted packaging.
    // Replacing the file avoids truncating a manifest mapped by the preview server.
    public static void PublishWebManifest(BuildReport report)
    {
        if(report==null) throw new Exception("No completed Unity build report");
        if(report.summary.result!=BuildResult.Succeeded) throw new Exception("Unity build failed: "+report.summary.result);
        string root=Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
        string destination=Path.Combine(root,"public/games/shadow-checkers/unity");
        if(report.summary.platform!=BuildTarget.WebGL || !string.Equals(Path.GetFullPath(report.summary.outputPath).Replace('\\','/').TrimEnd('/'),destination.Replace('\\','/').TrimEnd('/'),StringComparison.OrdinalIgnoreCase))
            throw new Exception("Latest build is not the Shadow Checkers web player");
        var files=Directory.GetFiles(Path.Combine(destination,"Build")).Select(Path.GetFileName).ToArray();
        // Unity hashes the uncompressed input, so gzip and Brotli can otherwise
        // reuse a cache URL. Version the bytes actually delivered to the browser.
        Func<string,string> asset=suffix=> {
            string name=files.Single(file=>file.EndsWith(suffix));
            using(var sha=System.Security.Cryptography.SHA256.Create())
            using(var stream=File.OpenRead(Path.Combine(destination,"Build",name)))
                return "Build/"+name+"?v="+BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
        };
        var manifest=new WebManifest {
            loaderUrl=asset(".loader.js"),dataUrl=asset(".data.unityweb"),frameworkUrl=asset(".framework.js.unityweb"),codeUrl=asset(".wasm.unityweb")
        };
        WriteAtomically(Path.Combine(destination,"build-manifest.json"),JsonUtility.ToJson(manifest,true));
        string indexPath=Path.Combine(destination,"index.html"),index=File.ReadAllText(indexPath);
        foreach(string url in new[]{manifest.loaderUrl,manifest.dataUrl,manifest.frameworkUrl,manifest.codeUrl}) {
            string versioned=url.Substring("Build/".Length),name=versioned.Split('?')[0];
            index=System.Text.RegularExpressions.Regex.Replace(index,System.Text.RegularExpressions.Regex.Escape(name)+@"(?:\?v=[a-f0-9]+)?",versioned);
        }
        WriteAtomically(indexPath,index);
        Directory.CreateDirectory(Path.Combine(root,"output/shadow-checkers-unity"));
        WriteAtomically(Path.Combine(root,"output/shadow-checkers-unity/build.json"),"{\"result\":\"Succeeded\",\"bytes\":"+report.summary.totalSize+"}");
        Debug.Log("SHADOW_CHECKERS_WEB_BUILD_SUCCEEDED");
    }

    static void WriteAtomically(string path,string content)
    {
        string pending=path+"."+Guid.NewGuid().ToString("N")+".tmp";
        try {
            File.WriteAllText(pending,content);
            if(File.Exists(path)) File.Replace(pending,path,null); else File.Move(pending,path);
        } finally {if(File.Exists(pending)) File.Delete(pending);}
    }

    [MenuItem("ShadowChat/Preview game")]
    public static void Preview()
    {
        CreateScene();
        EditorApplication.isPlaying=true;
    }

    [MenuItem("ShadowChat/Capture study")]
    public static void CaptureStudy()
    {
        var board=UnityEngine.Object.FindFirstObjectByType<ShadowBoard>();
        var camera=GameObject.Find("Table Camera").GetComponent<Camera>();
        var old=camera.targetTexture;
        var rt=new RenderTexture(1920,1200,24,RenderTextureFormat.ARGB32,RenderTextureReadWrite.sRGB);
        camera.targetTexture=rt; board.SetCamera("reset"); camera.Render();
        var previous=RenderTexture.active; RenderTexture.active=rt;
        var image=new Texture2D(1920,1200,TextureFormat.RGB24,false);
        image.ReadPixels(new Rect(0,0,1920,1200),0,0);image.Apply();
        string directory=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../output/playwright/shadow-checkers-unity"));
        Directory.CreateDirectory(directory);File.WriteAllBytes(Path.Combine(directory,"study-native.png"),image.EncodeToPNG());
        RenderTexture.active=previous;camera.targetTexture=old;rt.Release();UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(image);board.SetCamera("reset");
    }
}
