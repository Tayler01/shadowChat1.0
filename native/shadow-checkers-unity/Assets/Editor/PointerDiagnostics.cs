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
    [Serializable] sealed class Report {public string status="running";public int pieceHits;public int emptyHits;public int orientationChecks;public string failure;}
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
            report.orientationChecks=VerifySeatOrientation(board,camera,pick,tokens);
            report.status="passed";
        } catch(Exception error) {report.status="failed";report.failure=error.Message;throw;}
        finally {
            camera.ResetAspect();board.SetCamera("reset");
            var path=Path.GetFullPath("../../output/shadow-checkers-unity/pointer-checks.json");
            Directory.CreateDirectory(Path.GetDirectoryName(path));File.WriteAllText(path,JsonUtility.ToJson(report,true));
        }
    }

    static int VerifySeatOrientation(ShadowBoard board,Camera camera,MethodInfo pick,IDictionary tokens)
    {
        const int row=0,col=1;
        const string id="pointer-orientation-probe";
        int checks=0;
        camera.aspect=1.34f;

        // First creation directly in player_two must use the rotated board space.
        AssertPiece("player_two","orientation-fresh",row,col);

        // Keep both the id and logical square fixed while changing seats. The
        // equal revision cases prove that viewerSlot changes still reorient it.
        AssertPiece("player_one","orientation-same-revision",row,col);
        AssertPiece("player_two","orientation-same-revision",row,col);
        AssertPiece("spectator","orientation-same-revision",row,col);
        AssertPiece("player_one","orientation-same-revision",row,col);

        // Each player's home row must land on the camera-facing side and remain
        // selectable by its logical (unrotated) row/column.
        AssertPiece("player_one","orientation-home-one",7,0,true);
        AssertPiece("player_two","orientation-home-two",0,1,true);

        // Interrupt a live move with a seat flip. The flip must snap to the
        // target's logical square, clear movement state, and restore picking.
        var movingPiece=new ShadowBoard.Piece {id=id,owner="player_one",row=7,col=0};
        board.ReceiveSnapshot(JsonUtility.ToJson(new ShadowBoard.Snapshot {
            version=1,revision="orientation-motion-start",viewerSlot="player_one",pieces=new[]{movingPiece},reducedMotion=true,disabled=true
        }));
        var destination=new ShadowBoard.Piece {id=id,owner="player_one",row=6,col=1};
        var move=new ShadowBoard.Move {pieceId=id,path=new[]{new ShadowBoard.Position {row=7,col=0},new ShadowBoard.Position {row=6,col=1}}};
        board.ReceiveSnapshot(JsonUtility.ToJson(new ShadowBoard.Snapshot {
            version=1,revision="orientation-motion-running",viewerSlot="player_one",pieces=new[]{destination},lastMove=move,reducedMotion=false,disabled=true
        }));
        var movingToken=tokens[id];
        var movingType=movingToken.GetType();
        var movingCountField=typeof(ShadowBoard).GetField("movingCount",BindingFlags.NonPublic|BindingFlags.Instance);
        var motionField=movingType.GetField("motion");
        if((int)movingCountField.GetValue(board)<=0 || motionField.GetValue(movingToken)==null)
            throw new Exception("Orientation move probe did not enter its moving state");
        board.ReceiveSnapshot(JsonUtility.ToJson(new ShadowBoard.Snapshot {
            version=1,revision="orientation-motion-running",viewerSlot="player_two",pieces=new[]{destination},reducedMotion=true,disabled=true
        }));
        var expectedAfterFlip=new Vector3(2.5f,.173f,2.5f);
        var movingRoot=(GameObject)movingType.GetField("root").GetValue(movingToken);
        if((int)movingCountField.GetValue(board)!=0 || motionField.GetValue(movingToken)!=null)
            throw new Exception("Seat flip did not clear the interrupted movement state");
        AssertTransform("player_two after move",movingRoot,expectedAfterFlip);
        AssertPick("player_two after move",movingToken,6,1);
        checks++;
        return checks;

        void AssertPiece(string viewer,string revision,int pieceRow,int pieceCol,bool ownHome=false)
        {
            var piece=new ShadowBoard.Piece {id=id,owner=ownHome?viewer:"player_one",row=pieceRow,col=pieceCol};
            board.ReceiveSnapshot(JsonUtility.ToJson(new ShadowBoard.Snapshot {
                version=1,revision=revision,viewerSlot=viewer,pieces=new[]{piece},reducedMotion=true,disabled=true
            }));
            if(!tokens.Contains(id)) throw new Exception("Orientation probe token missing for "+viewer);
            var token=tokens[id];
            var root=(GameObject)token.GetType().GetField("root").GetValue(token);
            var expectedRow=viewer=="player_two"?7-pieceRow:pieceRow;
            var expectedCol=viewer=="player_two"?7-pieceCol:pieceCol;
            var expected=new Vector3(expectedCol-3.5f,.173f,3.5f-expectedRow);
            AssertTransform(viewer,root,expected);
            AssertPick(viewer,token,pieceRow,pieceCol);
            checks++;

            if(ownHome)
            {
                board.SetCamera("reset");
                AssertTransform(viewer,root,expected);
                AssertPick(viewer,token,pieceRow,pieceCol);
                var cameraFacing=Vector3.Distance(camera.transform.position,root.transform.position);
                var opposingLogicalRow=viewer=="player_two"?7:0;
                var opposingWorldRow=viewer=="player_two"?7-opposingLogicalRow:opposingLogicalRow;
                var opposingPosition=new Vector3(expectedCol-3.5f,.173f,3.5f-opposingWorldRow);
                if(cameraFacing>=Vector3.Distance(camera.transform.position,opposingPosition))
                    throw new Exception("Own pieces are not nearer the camera for "+viewer);
                checks++;

                board.SetCamera("tactical");
                AssertTransform(viewer,root,expected);
                AssertPick(viewer,token,pieceRow,pieceCol);
                checks++;
                board.SetCamera("reset");
                AssertTransform(viewer,root,expected);
                AssertPick(viewer,token,pieceRow,pieceCol);
                checks++;
            }
        }

        void AssertTransform(string viewer,GameObject root,Vector3 expected)
        {
            if(Vector3.Distance(root.transform.position,expected)>.001f)
                throw new Exception("Seat orientation transform mismatch for "+viewer+": expected "+expected+", got "+root.transform.position);
            if(Quaternion.Angle(root.transform.localRotation,Quaternion.identity)>.1f)
                throw new Exception("Seat orientation left token rotated for "+viewer);
        }

        void AssertPick(string viewer,object token,int expectedRow,int expectedCol)
        {
            var bounds=(Bounds)token.GetType().GetField("pickBounds").GetValue(token);
            var root=(GameObject)token.GetType().GetField("root").GetValue(token);
            var top=root.transform.TransformPoint(bounds.center+Vector3.up*bounds.extents.y*.9f);
            var point=camera.WorldToViewportPoint(top);
            if(point.z<=0 || point.x<=0 || point.x>=1 || point.y<=0 || point.y>=1)
                throw new Exception("Oriented own piece outside view for "+viewer);
            var found=(ShadowBoard.Position)pick.Invoke(board,new object[]{camera.ViewportPointToRay(point)});
            if(found==null || found.row!=expectedRow || found.col!=expectedCol)
                throw new Exception("Oriented token mispicked for "+viewer+": expected "+expectedRow+","+expectedCol);
        }
    }
}
