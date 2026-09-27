using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;

public static class CameraDiagnostics
{
    [Serializable] sealed class Report {
        public string status="running";public int poses;public float maximumPitchError;
        public bool zoomAtSteepAngle;public string failure;
    }
    [MenuItem("ShadowChat/Verify camera gesture range")]
    public static void Verify()
    {
        if(!EditorApplication.isPlaying)throw new InvalidOperationException("Start Play mode first");
        var board=UnityEngine.Object.FindFirstObjectByType<ShadowBoard>();
        var camera=GameObject.Find("Table Camera").GetComponent<Camera>();
        var flags=BindingFlags.Instance|BindingFlags.NonPublic;
        var angle=typeof(ShadowBoard).GetField("cameraAngle",flags);
        var pitch=typeof(ShadowBoard).GetField("cameraPitch",flags);
        var zoom=typeof(ShadowBoard).GetField("cameraZoom",flags);
        var update=typeof(ShadowBoard).GetMethod("UpdateCamera",flags);
        var report=new Report();
        try {
            board.SetCamera("reset");
            foreach(float aspect in new[]{1.34f,1.78f,2.85f})
            foreach(float heading in new[]{0f,90f,180f,270f})
            foreach(float tilt in new[]{20f,27.144f,35f,45f,55f,65f})
            foreach(float scale in new[]{.75f,1f,1.18f}) {
                camera.aspect=aspect;angle.SetValue(board,heading);pitch.SetValue(board,tilt);zoom.SetValue(board,scale);
                update.Invoke(board,null);
                var offset=camera.transform.position-new Vector3(0,-.65f,0);
                float measured=Mathf.Atan2(offset.y,new Vector2(offset.x,offset.z).magnitude)*Mathf.Rad2Deg;
                report.maximumPitchError=Mathf.Max(report.maximumPitchError,Mathf.Abs(measured-tilt));
                if(Mathf.Abs(measured-tilt)>.01f)throw new Exception("Tilt flattened at "+tilt);
                if(camera.transform.position.y>9.801f || Mathf.Abs(offset.x)>15.401f || Mathf.Abs(offset.z)>15.401f)
                    throw new Exception("Camera left the safe room volume");
                var center=camera.WorldToViewportPoint(Vector3.zero);
                if(center.z<=0 || center.x<=0 || center.x>=1 || center.y<=0 || center.y>=1)
                    throw new Exception("Board center left view");
                report.poses++;
            }
            board.SetCamera("reset");camera.aspect=1.78f;
            for(int i=0;i<8;i++)board.MoveCamera("{\"tilt\":0.15,\"zoomRatio\":1}");
            float before=camera.fieldOfView;
            board.MoveCamera("{\"zoomRatio\":0.9}");
            if(camera.fieldOfView>=before)throw new Exception("Zoom stopped at steep tilt");
            board.MoveCamera("{\"zoomRatio\":1.111111}");
            if(Mathf.Abs(camera.fieldOfView-before)>.01f)throw new Exception("Zoom failed to reverse");
            report.zoomAtSteepAngle=true;report.status="passed";
        } catch(Exception error) {report.status="failed";report.failure=error.Message;throw;}
        finally {
            camera.ResetAspect();board.SetCamera("reset");
            var path=Path.GetFullPath("../../output/shadow-checkers-unity/camera-range-checks.json");
            Directory.CreateDirectory(Path.GetDirectoryName(path));File.WriteAllText(path,JsonUtility.ToJson(report,true));
        }
    }
}
