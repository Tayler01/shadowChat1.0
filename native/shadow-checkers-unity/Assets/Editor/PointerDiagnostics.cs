using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;

// Exercises real token meshes and the production camera/picking code in Play mode.
public static class PointerDiagnostics
{
    [Serializable] sealed class Report {public string status="running";public int pieceHits;public int emptyHits;public string failure;}
    [MenuItem("ShadowChat/Verify raised piece picking")]
    public static void Verify()
    {
        if(!EditorApplication.isPlaying) throw new InvalidOperationException("Start Play mode first");
        var report=new Report();
        var board=UnityEngine.Object.FindFirstObjectByType<ShadowBoard>();
        var camera=GameObject.Find("Table Camera").GetComponent<Camera>();
        var flags=BindingFlags.NonPublic|BindingFlags.Instance;
        var pick=typeof(ShadowBoard).GetMethod("PickSquare",flags);
        var tokens=(IDictionary)typeof(ShadowBoard).GetField("tokens",flags).GetValue(board);
        var corners=new[]{new[]{0,1},new[]{0,7},new[]{7,0},new[]{7,6}};
        int revision=0;
        try {
            foreach(string viewer in new[]{"player_one","player_two"})
            foreach(float aspect in new[]{2.85f,1.78f,1.34f})
            foreach(string command in new[]{"reset","left","right","tactical","steep"}) {
                camera.aspect=aspect;
                foreach(bool king in new[]{false,true}) foreach(var square in corners) {
                    var piece=new ShadowBoard.Piece {id="pointer-probe",owner=viewer,row=square[0],col=square[1],king=king};
                    board.ReceiveSnapshot(JsonUtility.ToJson(new ShadowBoard.Snapshot {version=1,revision="pointer-"+(revision++),viewerSlot=viewer,pieces=new[]{piece},reducedMotion=true,disabled=true}));
                    board.SetCamera("reset");
                    if(command=="steep")for(int step=0;step<5;step++)board.MoveCamera("{\"tilt\":0.2,\"zoomRatio\":1}");
                    else if(command!="reset")board.SetCamera(command);
                    var token=tokens[piece.id];
                    var bounds=(Bounds)token.GetType().GetField("pickBounds").GetValue(token);
                    var root=(GameObject)token.GetType().GetField("root").GetValue(token);
                    var top=root.transform.TransformPoint(bounds.center+Vector3.up*bounds.extents.y*.9f);
                    var point=camera.WorldToViewportPoint(top);
                    if(point.x<=0 || point.x>=1 || point.y<=0 || point.y>=1) throw new Exception("Piece outside view: "+viewer+" "+aspect+" "+command);
                    var found=(ShadowBoard.Position)pick.Invoke(board,new object[]{camera.ViewportPointToRay(point)});
                    if(found==null || found.row!=piece.row || found.col!=piece.col) throw new Exception("Raised piece mispicked: "+viewer+" "+command+" king="+king);
                    report.pieceHits++;
                }
                board.ReceiveSnapshot(JsonUtility.ToJson(new ShadowBoard.Snapshot {version=1,revision="pointer-empty-"+(revision++),viewerSlot=viewer,pieces=new ShadowBoard.Piece[0],reducedMotion=true,disabled=true}));
                for(int row=0;row<8;row++)for(int col=0;col<8;col++)if((row+col)%2==1) {
                    int r=viewer=="player_two"?7-row:row,c=viewer=="player_two"?7-col:col;
                    var point=camera.WorldToViewportPoint(new Vector3(c-3.5f,.18f,3.5f-r));
                    var found=(ShadowBoard.Position)pick.Invoke(board,new object[]{camera.ViewportPointToRay(point)});
                    if(found==null || found.row!=row || found.col!=col) throw new Exception("Empty destination mispicked: "+viewer+" "+command);
                    report.emptyHits++;
                }
            }
            report.status="passed";
        } catch(Exception error) {report.status="failed";report.failure=error.Message;throw;}
        finally {
            camera.ResetAspect();board.SetCamera("reset");
            var path=Path.GetFullPath("../../output/shadow-checkers-unity/pointer-checks.json");
            Directory.CreateDirectory(Path.GetDirectoryName(path));File.WriteAllText(path,JsonUtility.ToJson(report,true));
        }
    }
}
