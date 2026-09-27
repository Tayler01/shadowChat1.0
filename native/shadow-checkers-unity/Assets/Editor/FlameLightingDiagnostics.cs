using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;

// Compare actual shader pixels with the local light position. This catches
// CPU/shader timing or coordinate drift without relying on duplicated formulas.
public static class FlameLightingDiagnostics
{
    [Serializable] public class EnergyReport
    {
        public int renderedSamples;
        public float maximumCandleMismatch,maximumHearthMismatch;
        public bool passed;
    }
    // Measure linear HDR pixels before tone mapping: clipping a bright core to
    // white would hide changes in emitted energy and give a misleading result.
    public static string RunEnergy()
    {
        var effects=UnityEngine.Object.FindFirstObjectByType<MedievalStudyEffects>();
        if(effects==null) throw new InvalidOperationException("Start the study in Play mode first.");
        const BindingFlags flags=BindingFlags.NonPublic|BindingFlags.Instance;
        var type=typeof(MedievalStudyEffects);
        var flames=(List<Transform>)type.GetField("flames",flags).GetValue(effects);
        var lights=(List<Light>)type.GetField("lights",flags).GetValue(effects);
        var clock=type.GetField("clock",flags);var update=type.GetMethod("LateUpdate",flags);
        float oldClock=(float)clock.GetValue(effects);
        bool oldPaused=(bool)type.GetField("paused",flags).GetValue(effects);
        bool oldReduced=(bool)type.GetField("reducedMotion",flags).GetValue(effects);
        var probe=new GameObject("Temporary flame energy probe");probe.hideFlags=HideFlags.HideAndDontSave;
        var camera=probe.AddComponent<Camera>();camera.enabled=false;camera.orthographic=true;
        camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=Color.black;
        camera.cullingMask=1<<30;camera.nearClipPlane=.01f;camera.farClipPlane=4;
        camera.allowHDR=true;camera.allowMSAA=false;
        var target=new RenderTexture(128,128,16,RenderTextureFormat.ARGBHalf,RenderTextureReadWrite.Linear);
        var pixels=new Texture2D(128,128,TextureFormat.RGBAFloat,false,true);
        camera.targetTexture=target;var oldTarget=RenderTexture.active;
        const int samples=32;
        var optical=new double[6,samples];var illumination=new double[6,samples];
        var report=new EnergyReport();
        try {
            effects.Configure(false,true);
            for(int sample=0;sample<samples;sample++) {
                clock.SetValue(effects,sample*.091f);update.Invoke(effects,null);
                for(int index=0;index<flames.Count;index++) {
                    var flame=flames[index];int oldLayer=flame.gameObject.layer;flame.gameObject.layer=30;
                    try {
                        camera.orthographicSize=Mathf.Max(flame.lossyScale.x,flame.lossyScale.y)*.6f;
                        camera.transform.position=flame.position+Vector3.up*flame.lossyScale.y*.5f+flame.forward*2;
                        camera.transform.rotation=Quaternion.LookRotation(-flame.forward,Vector3.up);
                        camera.Render();RenderTexture.active=target;
                        pixels.ReadPixels(new Rect(0,0,128,128),0,0);pixels.Apply();
                        double mass=0;
                        foreach(var color in pixels.GetPixels()) mass+=color.r*.2126+color.g*.7152+color.b*.0722;
                        if(mass<1)throw new InvalidOperationException("Flame shader rendered no energy.");
                        // Compensate for different probe framing so the three
                        // hearth tongues contribute according to their area.
                        int light=index<3?0:index-2;
                        optical[light,sample]+=mass*4*camera.orthographicSize*camera.orthographicSize;
                        illumination[light,sample]=lights[light].intensity;
                        report.renderedSamples++;
                    } finally {flame.gameObject.layer=oldLayer;}
                }
            }
            for(int light=0;light<6;light++) {
                double totalOptical=0,totalLight=0;
                for(int sample=0;sample<samples;sample++){totalOptical+=optical[light,sample];totalLight+=illumination[light,sample];}
                for(int sample=0;sample<samples;sample++) {
                    float difference=(float)Math.Abs(optical[light,sample]/totalOptical*samples-illumination[light,sample]/totalLight*samples);
                    if(light==0)report.maximumHearthMismatch=Mathf.Max(report.maximumHearthMismatch,difference);
                    else report.maximumCandleMismatch=Mathf.Max(report.maximumCandleMismatch,difference);
                }
            }
            report.passed=report.renderedSamples==256 && report.maximumCandleMismatch<.015f && report.maximumHearthMismatch<.025f;
            string json=JsonUtility.ToJson(report,true);
            File.WriteAllText(Path.GetFullPath(Path.Combine(Application.dataPath,"../../../output/shadow-checkers-unity/flame-energy-checks.json")),json);
            return json;
        } finally {
            effects.Configure(false,true);clock.SetValue(effects,oldClock);update.Invoke(effects,null);effects.Configure(oldReduced,oldPaused);
            RenderTexture.active=oldTarget;camera.targetTexture=null;target.Release();
            UnityEngine.Object.DestroyImmediate(probe);UnityEngine.Object.DestroyImmediate(target);UnityEngine.Object.DestroyImmediate(pixels);
        }
    }
    [Serializable] public class Report
    {
        public int renderedSamples;
        public float maximumHorizontalError, maximumVerticalError, meanVerticalOffset, sourceTravel;
        public bool pausedClockFrozen, reducedClockFrozen, passed;
    }
    public static string Run()
    {
        var effects=UnityEngine.Object.FindFirstObjectByType<MedievalStudyEffects>();
        if(effects==null) throw new InvalidOperationException("Start the study in Play mode first.");
        const BindingFlags flags=BindingFlags.NonPublic|BindingFlags.Instance;
        var type=typeof(MedievalStudyEffects);
        var flames=(List<Transform>)type.GetField("flames",flags).GetValue(effects);
        var lights=(List<Light>)type.GetField("lights",flags).GetValue(effects);
        var clock=type.GetField("clock",flags);var update=type.GetMethod("LateUpdate",flags);
        float previousClock=(float)clock.GetValue(effects);
        bool previousPaused=(bool)type.GetField("paused",flags).GetValue(effects);
        bool previousReduced=(bool)type.GetField("reducedMotion",flags).GetValue(effects);
        var probe=new GameObject("Temporary candle optical probe");
        probe.hideFlags=HideFlags.HideAndDontSave;
        var camera=probe.AddComponent<Camera>();camera.enabled=false;
        camera.orthographic=true;camera.orthographicSize=.28f;
        camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=Color.black;
        camera.cullingMask=1<<30;camera.nearClipPlane=.01f;camera.farClipPlane=4;
        camera.allowHDR=false;camera.allowMSAA=false;
        var target=new RenderTexture(128,128,16,RenderTextureFormat.ARGB32);
        var pixels=new Texture2D(128,128,TextureFormat.RGB24,false,true);
        camera.targetTexture=target;var previousTarget=RenderTexture.active;
        var report=new Report();var startPositions=new Vector3[5];
        try {
            effects.Configure(false,true);
            update.Invoke(effects,null);
            report.pausedClockFrozen=(float)clock.GetValue(effects)==previousClock;
            effects.Configure(true,false);
            update.Invoke(effects,null);
            report.reducedClockFrozen=(float)clock.GetValue(effects)==previousClock;
            effects.Configure(false,true);
            for(int sample=0;sample<9;sample++) {
                clock.SetValue(effects,sample*.37f);update.Invoke(effects,null);
                for(int index=3;index<flames.Count;index++) {
                    var flame=flames[index];int previousLayer=flame.gameObject.layer;
                    flame.gameObject.layer=30;
                    try {
                        camera.transform.position=flame.position+Vector3.up*.23f+flame.forward*2;
                        camera.transform.rotation=Quaternion.LookRotation(-flame.forward,Vector3.up);
                        camera.Render();RenderTexture.active=target;
                        pixels.ReadPixels(new Rect(0,0,128,128),0,0);pixels.Apply();
                        var colors=pixels.GetPixels();double mass=0,xSum=0,ySum=0;
                        for(int y=0;y<128;y++)for(int x=0;x<128;x++) {
                            var color=colors[y*128+x];double weight=color.r*.2126+color.g*.7152+color.b*.0722;
                            mass+=weight;xSum+=(x+.5)*weight;ySum+=(y+.5)*weight;
                        }
                        if(mass<1) throw new InvalidOperationException("Candle shader rendered no flame.");
                        var source=lights[index-2].transform.position;
                        var projected=camera.WorldToViewportPoint(source);
                        report.maximumHorizontalError=Mathf.Max(report.maximumHorizontalError,Mathf.Abs(projected.x-(float)(xSum/mass/128))*.56f);
                        report.maximumVerticalError=Mathf.Max(report.maximumVerticalError,Mathf.Abs(projected.y-(float)(ySum/mass/128))*.56f);
                        report.meanVerticalOffset+=(projected.y-(float)(ySum/mass/128))*.56f;
                        if(sample==0)startPositions[index-3]=source;
                        report.sourceTravel=Mathf.Max(report.sourceTravel,Vector3.Distance(source,startPositions[index-3]));
                        report.renderedSamples++;
                    } finally {flame.gameObject.layer=previousLayer;}
                }
            }
            report.meanVerticalOffset/=Mathf.Max(1,report.renderedSamples);
            report.passed=report.renderedSamples==45 && report.maximumHorizontalError<.004f
                && report.maximumVerticalError<.01f && report.sourceTravel>.001f
                && report.pausedClockFrozen && report.reducedClockFrozen;
            string json=JsonUtility.ToJson(report,true);
            string path=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../output/shadow-checkers-unity/flame-lighting-checks.json"));
            Directory.CreateDirectory(Path.GetDirectoryName(path));File.WriteAllText(path,json);
            return json;
        } finally {
            effects.Configure(false,true);clock.SetValue(effects,previousClock);update.Invoke(effects,null);
            effects.Configure(previousReduced,previousPaused);
            RenderTexture.active=previousTarget;camera.targetTexture=null;target.Release();
            UnityEngine.Object.DestroyImmediate(probe);UnityEngine.Object.DestroyImmediate(target);UnityEngine.Object.DestroyImmediate(pixels);
        }
    }
}
