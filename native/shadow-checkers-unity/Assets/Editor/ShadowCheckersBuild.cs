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
    public static void BuildWeb()
    {
        string statusRoot=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../output/shadow-checkers-unity"));
        Directory.CreateDirectory(statusRoot);string marker=Path.Combine(statusRoot,"build.running");
        File.WriteAllText(marker,DateTime.UtcNow.ToString("O"));
        try {
        foreach(var path in Directory.GetFiles("Assets/Resources/Textures","*.jpg"))
            AssetDatabase.ImportAsset(path.Replace('\\','/'),ImportAssetOptions.ForceUpdate);
        foreach(var path in Directory.GetFiles("Assets/Resources/Models","*.fbx"))
            AssetDatabase.ImportAsset(path.Replace('\\','/'),ImportAssetOptions.ForceUpdate);
        CreateScene();
        foreach(var shader in Resources.LoadAll<Shader>(""))
            if(ShaderUtil.ShaderHasError(shader)) throw new Exception("Shader compilation failed: "+shader.name);
        PlayerSettings.companyName="ShadowChat";
        PlayerSettings.productName="Shadow Checkers";
        PlayerSettings.colorSpace=ColorSpace.Linear;
        PlayerSettings.WebGL.compressionFormat=WebGLCompressionFormat.Gzip;
        PlayerSettings.WebGL.decompressionFallback=true;
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
        if(report.summary.result!=BuildResult.Succeeded) throw new Exception("Unity build failed: "+report.summary.result);
        var files=Directory.GetFiles(Path.Combine(destination,"Build")).Select(Path.GetFileName).ToArray();
        Func<string,string> asset=suffix=>"Build/"+files.Single(name=>name.EndsWith(suffix));
        File.WriteAllText(Path.Combine(destination,"build-manifest.json"),JsonUtility.ToJson(new WebManifest {
            loaderUrl=asset(".loader.js"),dataUrl=asset(".data.unityweb"),frameworkUrl=asset(".framework.js.unityweb"),codeUrl=asset(".wasm.unityweb")
        },true));
        Directory.CreateDirectory(Path.Combine(root,"output/shadow-checkers-unity"));
        File.WriteAllText(Path.Combine(root,"output/shadow-checkers-unity/build.json"),"{\"result\":\"Succeeded\",\"bytes\":"+report.summary.totalSize+"}");
        Debug.Log("SHADOW_CHECKERS_WEB_BUILD_SUCCEEDED");
        } finally {File.Delete(marker);}
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
