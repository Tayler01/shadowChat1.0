using System;
using System.IO;
using System.Reflection;
using System.Collections;
using UnityEditor;
using UnityEngine;

// Checks gesture response and convergence in Play mode, including the explicit
// camera modes and reduced-motion path that share the gesture controller.
public sealed class CameraGestureDiagnosticRunner : MonoBehaviour
{
    [Serializable] sealed class Report
    {
        public string status="running";
        public bool responsive;
        public bool frameRateIndependent;
        public bool converged;
        public bool resetExact;
        public bool directionalRotationSmooth;
        public bool overheadExact;
        public bool reducedMotionImmediate;
        public string failure;
    }

    [MenuItem("ShadowChat/Verify camera gesture smoothing")]
    public static void Verify()
    {
        if(!EditorApplication.isPlaying) throw new InvalidOperationException("Start Play mode first");
        var board=UnityEngine.Object.FindFirstObjectByType<ShadowBoard>();
        if(board==null) throw new InvalidOperationException("ShadowBoard is missing");
        board.StartCoroutine(Run(board));
    }

    static IEnumerator Run(ShadowBoard board)
    {
        var report=new Report();
        var camera=GameObject.Find("Table Camera").GetComponent<Camera>();
        const BindingFlags instanceFlags=BindingFlags.Instance|BindingFlags.NonPublic;
        var currentField=typeof(ShadowBoard).GetField("current",instanceFlags);
        var snapshot=(ShadowBoard.Snapshot)currentField.GetValue(board);
        bool originalReducedMotion=snapshot.reducedMotion;
        var checks=RunChecks(board,camera,snapshot,report,instanceFlags);
        while(true) {
            bool hasNext=false;
            object step=null;
            try {hasNext=checks.MoveNext();if(hasNext)step=checks.Current;}
            catch(Exception error) {report.status="failed";report.failure=error.Message;Debug.LogException(error);}
            if(!hasNext || report.status=="failed") break;
            yield return step;
        }
        snapshot.reducedMotion=originalReducedMotion;
        camera.ResetAspect();board.SetCamera("reset");
        var path=Path.GetFullPath("../../output/shadow-checkers-unity/camera-gesture-checks.json");
        Directory.CreateDirectory(Path.GetDirectoryName(path));
        File.WriteAllText(path,JsonUtility.ToJson(report,true));
        Debug.Log("Camera gesture diagnostic: "+JsonUtility.ToJson(report));
    }

    static IEnumerator RunChecks(ShadowBoard board,Camera camera,ShadowBoard.Snapshot snapshot,Report report,BindingFlags flags)
    {
        var angleField=typeof(ShadowBoard).GetField("cameraAngle",flags);
        var zoomField=typeof(ShadowBoard).GetField("cameraZoom",flags);
        var pose=typeof(ShadowBoard).GetMethod("CameraPose",flags);
        var blend=typeof(ShadowBoard).GetMethod("CameraGestureBlend",BindingFlags.Static|BindingFlags.NonPublic);
        snapshot.reducedMotion=false;
        camera.aspect=1.78f;
        board.SetCamera("reset");
        var resetPosition=camera.transform.position;
        var resetRotation=camera.transform.rotation;
        float resetFov=camera.fieldOfView;

        float oneFrame=(float)blend.Invoke(null,new object[]{1f/30});
        float threeFastFrames=0;
        float fastFrame=(float)blend.Invoke(null,new object[]{1f/90});
        for(int i=0;i<3;i++) threeFastFrames=threeFastFrames+(1-threeFastFrames)*fastFrame;
        if(Mathf.Abs(oneFrame-threeFastFrames)>.00001f) throw new Exception("Camera easing depends on frame rate");
        report.frameRateIndependent=true;

        var startPosition=camera.transform.position;
        float startFov=camera.fieldOfView;
        board.MoveCamera("{\"turn\":0.25,\"tilt\":0.3,\"zoomRatio\":1.25}");
        float targetAngle=Mathf.Repeat((float)angleField.GetValue(board),360);
        if(Mathf.Abs(Mathf.DeltaAngle(12,targetAngle)-22.5f)>.01f) throw new Exception("Camera turn axis or scale changed");
        float targetZoom=(float)zoomField.GetValue(board);
        float targetFov=43*targetZoom;
        if(targetZoom<=1 || targetFov<=resetFov) throw new Exception("Positive pinch direction changed");
        var targetArgs=new object[]{Vector3.zero,Quaternion.identity};
        pose.Invoke(board,targetArgs);
        var targetPosition=(Vector3)targetArgs[0];
        var targetRotation=(Quaternion)targetArgs[1];

        float targetTravel=Vector3.Distance(startPosition,targetPosition);
        float firstTravel=Vector3.Distance(startPosition,camera.transform.position);
        if(firstTravel<.001f || firstTravel>=targetTravel*.95f ||
           Mathf.Abs(camera.fieldOfView-startFov)<.001f || camera.fieldOfView>=targetFov)
            throw new Exception("Gesture did not move promptly and smoothly toward its target");
        report.responsive=true;

        bool settled=false;
        for(int frame=0;frame<120;frame++) {
            if(Vector3.Distance(camera.transform.position,targetPosition)<.001f &&
               Quaternion.Angle(camera.transform.rotation,targetRotation)<.03f &&
               Mathf.Abs(camera.fieldOfView-targetFov)<.006f) {settled=true;break;}
            yield return null;
        }
        if(!settled) throw new Exception("Camera gesture failed to reach its exact target");
        report.converged=true;

        board.SetCamera("reset");
        if(Vector3.Distance(camera.transform.position,resetPosition)>.0001f ||
           Quaternion.Angle(camera.transform.rotation,resetRotation)>.001f ||
           Mathf.Abs(camera.fieldOfView-resetFov)>.001f)
            throw new Exception("Camera reset drifted after gesture smoothing");
        report.resetExact=true;

        startPosition=camera.transform.position;
        board.SetCamera("left");
        float directionalTarget=(float)angleField.GetValue(board);
        if(Mathf.Abs(Mathf.DeltaAngle(12,directionalTarget)+25)>.01f)
            throw new Exception("Directional camera rotation changed its established axis");
        targetArgs[0]=Vector3.zero;targetArgs[1]=Quaternion.identity;pose.Invoke(board,targetArgs);
        targetPosition=(Vector3)targetArgs[0];targetRotation=(Quaternion)targetArgs[1];
        firstTravel=Vector3.Distance(startPosition,camera.transform.position);
        targetTravel=Vector3.Distance(startPosition,targetPosition);
        if(firstTravel<.001f || firstTravel>=targetTravel*.95f)
            throw new Exception("Directional camera rotation did not ease promptly");
        settled=false;
        for(int frame=0;frame<120;frame++) {
            if(Vector3.Distance(camera.transform.position,targetPosition)<.001f &&
               Quaternion.Angle(camera.transform.rotation,targetRotation)<.03f) {settled=true;break;}
            yield return null;
        }
        if(!settled) throw new Exception("Directional camera rotation failed to settle");
        report.directionalRotationSmooth=true;
        board.SetCamera("reset");
        if(Vector3.Distance(camera.transform.position,resetPosition)>.0001f ||
           Quaternion.Angle(camera.transform.rotation,resetRotation)>.001f)
            throw new Exception("Camera reset drifted after directional rotation");

        board.SetCamera("tactical");
        if(!camera.orthographic || Mathf.Abs(camera.transform.position.y-10)>.001f)
            throw new Exception("Overhead camera mode was not preserved");
        report.overheadExact=true;
        board.SetCamera("reset");

        snapshot.reducedMotion=true;
        board.MoveCamera("{\"turn\":0.05,\"tilt\":0,\"zoomRatio\":1}");
        targetArgs[0]=Vector3.zero;targetArgs[1]=Quaternion.identity;pose.Invoke(board,targetArgs);
        if(Vector3.Distance(camera.transform.position,(Vector3)targetArgs[0])>.0001f ||
           Quaternion.Angle(camera.transform.rotation,(Quaternion)targetArgs[1])>.001f)
            throw new Exception("Reduced-motion camera gesture was not immediate");
        report.reducedMotionImmediate=true;
        report.status="passed";
    }
}
