using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using Object=UnityEngine.Object;

// Live scene regression probe, kept out of player builds. It observes rendered
// transforms rather than duplicating the animation's interpolation formula.
public static class PresentationDiagnostics
{
    [Serializable] class Report {public string status="running";public List<string> checks=new List<string>();public string failure;}
    class Frozen {
        public Transform transform;public Vector3 position,scale;public Quaternion rotation;
        public Frozen(Transform t) {transform=t;position=t.position;scale=t.localScale;rotation=t.rotation;}
        public bool Unchanged {get {return transform!=null && Vector3.Distance(position,transform.position)<.00001f && Vector3.Distance(scale,transform.localScale)<.00001f && Quaternion.Angle(rotation,transform.rotation)<.001f;}}
    }
    static Report report;
    static string ReportPath {get {return Path.GetFullPath("../../output/shadow-checkers-unity/presentation-pause.json");}}
    static void Save() {Directory.CreateDirectory(Path.GetDirectoryName(ReportPath));File.WriteAllText(ReportPath,JsonUtility.ToJson(report,true));}
    static void Check(bool value,string message) {if(!value) throw new InvalidOperationException(message);report.checks.Add(message);}
    static int Moving(ShadowBoard board) {return (int)typeof(ShadowBoard).GetField("movingCount",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(board);}
    static ShadowBoard.Piece Piece(string id,int row,int col,bool king=false) {return new ShadowBoard.Piece {id=id,row=row,col=col,owner=id=="pause-mover"?"player_one":"player_two",king=king};}
    static ShadowBoard.Position At(int row,int col) {return new ShadowBoard.Position {row=row,col=col};}
    static void Snapshot(ShadowBoard board,string revision,ShadowBoard.Piece[] pieces,bool reduced=false,ShadowBoard.Move move=null)
    {board.ReceiveSnapshot(JsonUtility.ToJson(new ShadowBoard.Snapshot {version=1,revision=revision,viewerSlot="player_one",boardSkin="cinematic",pieces=pieces,reducedMotion=reduced,disabled=true,lastMove=move}));}

    [MenuItem("ShadowChat/Verify presentation pause")]
    public static void Verify()
    {
        if(!EditorApplication.isPlaying) throw new InvalidOperationException("Start Play mode before this probe");
        if(report!=null && report.status=="running") throw new InvalidOperationException("Presentation probe already running");
        var board=Object.FindFirstObjectByType<ShadowBoard>();report=new Report();Save();board.StartCoroutine(Run(board));
    }
    static IEnumerator Run(ShadowBoard board)
    {
        var cases=Cases(board);
        while(true) {
            bool more;object wait=null;
            try {more=cases.MoveNext();if(more) wait=cases.Current;}
            catch(Exception error) {report.status="failed";report.failure=error.Message;break;}
            if(!more) {report.status="passed";break;}
            yield return wait;
        }
        board.SetPaused("false");(cases as IDisposable)?.Dispose();Save();
        Debug.Log("Presentation pause probe: "+report.status+" "+report.failure);
    }
    static IEnumerator Cases(ShadowBoard board)
    {
        board.SetPaused("false");board.SetCamera("reset");
        var pieces=new[]{Piece("pause-mover",5,0),Piece("pause-victim-one",4,1),Piece("pause-victim-two",2,3)};
        Snapshot(board,"pause-initial",pieces,true);yield return null;
        Snapshot(board,"pause-ready",pieces);
        Snapshot(board,"pause-capture",new[]{Piece("pause-mover",1,4)},false,new ShadowBoard.Move {pieceId="pause-mover",path=new[]{At(5,0),At(3,2),At(1,4)},captures=new[]{At(4,1),At(2,3)}});
        yield return new WaitForSecondsRealtime(.10f);
        board.SetPaused("true");
        var mover=GameObject.Find("pause-mover");var first=GameObject.Find("pause-victim-one");var second=GameObject.Find("pause-victim-two");
        Check(mover!=null && first!=null && second!=null,"Pause reached before delayed captures");
        var held=new[]{new Frozen(mover.transform),new Frozen(first.transform),new Frozen(second.transform)};
        yield return new WaitForSecondsRealtime(1.1f);
        foreach(var item in held) Check(item.Unchanged,"Move and delayed capture remain frozen");
        Check(Moving(board)>0,"Paused move retains its input lock");
        board.SetPaused("false");
        var watch=System.Diagnostics.Stopwatch.StartNew();
        while(first!=null && first.transform.localScale.x>.99f && watch.Elapsed.TotalSeconds<6) yield return null;
        Check(first!=null && first.transform.localScale.x<.99f,"Capture reached its animated flight");
        board.SetPaused("true");held=new[]{new Frozen(mover.transform),new Frozen(first.transform),new Frozen(second.transform)};
        LineRenderer ripple=null;
        foreach(var line in board.GetComponentsInChildren<LineRenderer>()) if(line.name=="Cinematic silver ripple") {ripple=line;break;}
        Check(ripple!=null,"Capture ripple exists during flight");
        var ripplePoint=ripple.GetPosition(0);float rippleWidth=ripple.widthMultiplier;
        yield return new WaitForSecondsRealtime(1.1f);
        foreach(var item in held) Check(item.Unchanged,"Active capture and move remain frozen");
        Check(ripple!=null && Vector3.Distance(ripplePoint,ripple.GetPosition(0))<.00001f && Mathf.Abs(rippleWidth-ripple.widthMultiplier)<.00001f,"Capture ripple remains frozen");
        board.SetPaused("false");watch.Restart();
        while(Moving(board)>0 && watch.Elapsed.TotalSeconds<8) yield return null;
        Check(Moving(board)==0 && Vector3.Distance(mover.transform.position,new Vector3(.5f,.173f,2.5f))<.0001f,"Double capture resumes to its authoritative square and unlocks");
        Check(first==null && second==null,"Captured pieces finish disappearing after resume");

        pieces=new[]{Piece("pause-mover",2,1),Piece("pause-victim-one",1,2)};
        Snapshot(board,"crown-initial",pieces,true);yield return null;Snapshot(board,"crown-ready",pieces);
        Snapshot(board,"crown-move",new[]{Piece("pause-mover",0,3,true)},false,new ShadowBoard.Move {pieceId="pause-mover",path=new[]{At(2,1),At(0,3)},captures=new[]{At(1,2)}});
        watch.Restart();Transform crown=null;
        while(crown==null && watch.Elapsed.TotalSeconds<8) {crown=mover.transform.Find("Crown Carved marble");yield return null;}
        Check(crown!=null && crown.localPosition.y>.01f,"Crowning reached its descending marble tier");
        board.SetPaused("true");var heldCrown=new Frozen(crown);
        yield return new WaitForSecondsRealtime(1.3f);
        Check(heldCrown.Unchanged && Moving(board)>0,"Crown holds its pose and input lock while paused");
        board.SetPaused("false");watch.Restart();
        while(Moving(board)>0 && watch.Elapsed.TotalSeconds<8) yield return null;
        Check(Moving(board)==0 && crown.localPosition.sqrMagnitude<.000001f && Quaternion.Angle(crown.localRotation,Quaternion.identity)<.001f,"Crown lands once and unlocks after resume");
        Check(Vector3.Distance(mover.transform.position,new Vector3(-.5f,.173f,3.5f))<.0001f,"King finishes on the authoritative back-rank square");
    }
}
