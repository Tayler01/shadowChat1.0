using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Rendering;

public partial class ShadowBoard
{
    Coroutine cameraMotion;
    bool introPlayed;
    int movingCount;
    int capturingCount;
    int rippleCount;
    string presentedRevision;
    bool presentationPaused;
    // A resumed WebGL frame can include the time spent hidden. Advance every
    // cinematic by the same bounded, visible-time clock instead of wall time.
    float PresentationDelta { get { return presentationPaused?0:Mathf.Min(Time.unscaledDeltaTime,.05f); } }
    IEnumerator WaitForPresentation(float duration=0)
    {
        for(float elapsed=0;presentationPaused || elapsed<duration;elapsed+=PresentationDelta) yield return null;
    }
    [Serializable] class CinematicEvent {public int version=1;public string type="cinematic";public bool busy;public string stage;}
    [Serializable] class SoundEvent {public int version=1;public string type="sound";public string cue;}
    void Sound(string cue) {if(!presentationPaused) Emit(new SoundEvent {cue=cue});}
    void CinematicState(bool busy,string stage) {Emit(new CinematicEvent {busy=busy,stage=stage});}
    // A single C1-continuous rail. Only the beginning and
    // end ease; passing a control point never stops or changes shot.
    static Vector3 TourPoint(Vector3[] points,float progress)
    {
        float u=Mathf.Clamp01(progress)*(points.Length-1);
        int i=Mathf.Min(points.Length-2,Mathf.FloorToInt(u));float t=u-i;
        var b=points[i];var c=points[i+1];
        var a=i>0?points[i-1]:2*b-c;
        var d=i+2<points.Length?points[i+2]:2*c-b;
        return .5f*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
    }
    static float[] TourDistances(Vector3[] positions,Vector3[] targets)
    {
        const int samples=180;var distances=new float[samples+1];
        var previous=positions[0];var facing=Quaternion.LookRotation(targets[0]-previous);
        for(int i=1;i<=samples;i++) {
            float progress=i/(float)samples;var point=TourPoint(positions,progress);
            var next=Quaternion.LookRotation(TourPoint(targets,progress)-point);
            float travel=Vector3.Distance(previous,point);
            // Treat rotation as travel along a six-unit camera arm. Position-only
            // timing rushed the turn toward the library despite a smooth spline.
            float turn=Quaternion.Angle(facing,next)*Mathf.Deg2Rad*6;
            distances[i]=distances[i-1]+Mathf.Sqrt(travel*travel+turn*turn);
            previous=point;facing=next;
        }
        return distances;
    }
    IEnumerator RoomReveal()
    {
        CinematicState(true,"intro");
        UpdateCamera();var end=view.transform.position;
        // Enter through the right pane, clear of its central lead and crossbars.
        var positions=new[]{new Vector3(4.55f,5.8f,14.5f),new Vector3(4.3f,5.4f,10),new Vector3(9.8f,4.8f,6.8f),new Vector3(11.3f,4.6f,-1.8f),new Vector3(7.4f,5.3f,-9),end};
        var targets=new[]{new Vector3(0,2,4),new Vector3(0,3,11),new Vector3(-1.4f,4.25f,14),new Vector3(-10.5f,1,12.6f),new Vector3(-1,.3f,2),new Vector3(0,-.65f,0)};
        var distances=TourDistances(positions,targets);int samples=distances.Length-1;
        const float duration=12;
        for(float elapsed=0;elapsed<duration;) {
            if(presentationPaused) {yield return null;continue;}
            // WebGL's first frame can include startup work; never jump past a room view.
            elapsed+=PresentationDelta;
            if(current.reducedMotion) break;
            float t=Mathf.Clamp01(elapsed/duration);t=t*t*t*(t*(t*6-15)+10);
            float distance=t*distances[samples];int sample=1;
            while(sample<samples && distances[sample]<distance) sample++;
            float progress=(sample-1+Mathf.InverseLerp(distances[sample-1],distances[sample],distance))/samples;
            view.transform.position=TourPoint(positions,progress);
            view.transform.LookAt(TourPoint(targets,progress));
            SendProjection();yield return null;
        }
        cameraMotion=null;UpdateCamera();SendProjection();CinematicState(false,"ready");
    }
    float CaptureDelay(Move move,Piece victim)
    {
        if(move?.captures==null) return .2f;
        for(int i=0;i<move.captures.Length;i++) if(move.captures[i].row==victim.row && move.captures[i].col==victim.col) return i*.58f+.24f;
        return .2f;
    }
    IEnumerator CaptureToken(GameObject victim,float delay)
    {
        capturingCount++;
        try {yield return AnimateCapture(victim,delay);}
        finally {capturingCount=Mathf.Max(0,capturingCount-1);}
    }
    IEnumerator AnimateCapture(GameObject victim,float delay)
    {
        yield return WaitForPresentation(delay);
        if(victim==null) yield break;
        var origin=victim.transform.position;
        Sound("capture");
        StartCoroutine(ImpactRing(origin,.5f));
        for(float t=0;t<1;t+=PresentationDelta/.5f) {
            if(presentationPaused) {yield return null;continue;}
            if(victim==null) yield break;if(current.reducedMotion) break;
            victim.transform.position=origin+new Vector3(.11f*t,Mathf.Sin(t*Mathf.PI)*.42f-t*.12f,.1f*t);
            victim.transform.localRotation=Quaternion.Euler(t*68,t*35,t*-24);
            victim.transform.localScale=Vector3.one*(1-Mathf.SmoothStep(0,1,t));yield return null;
        }
        Destroy(victim);
    }
    IEnumerator CrownReveal(Token token,Piece king)
    {
        if(presentationPaused) yield return WaitForPresentation();
        CinematicState(true,"kinging");
        var origin=token.root.transform.position;
        StartCoroutine(ImpactRing(origin,1));
        // A separate solid marble tier descends onto the original piece.
        CreateTokenModel(token,king);
        var tiers=new System.Collections.Generic.List<Transform>();
        bool landed=false;
        foreach(Transform child in token.root.transform) if(child.name.StartsWith("Crown ")) tiers.Add(child);
        for(float t=0;t<1;t+=PresentationDelta/1.05f) {
            if(presentationPaused) {yield return null;continue;}
            if(token.root==null) yield break;if(current.reducedMotion) break;
            float fall=Mathf.Clamp01(t/.72f);float height=(1-fall)*(1-fall)*1.25f;
            if(!landed && fall>=1) {Sound("crown");landed=true;}
            foreach(var tier in tiers) {tier.localPosition=Vector3.up*height;tier.localRotation=Quaternion.Euler(0,Mathf.Lerp(55,0,fall),0);}
            yield return null;
        }
        foreach(var tier in tiers) {tier.localPosition=Vector3.zero;tier.localRotation=Quaternion.identity;}
        if(!landed) Sound("crown");
        token.root.transform.position=origin;token.root.transform.localRotation=Quaternion.identity;token.root.transform.localScale=Vector3.one;
        StartCoroutine(ImpactRing(origin,.75f));
    }
    IEnumerator ImpactRing(Vector3 origin,float size)
    {
        rippleCount++;
        try {yield return AnimateImpactRing(origin,size);}
        finally {rippleCount=Mathf.Max(0,rippleCount-1);}
    }
    IEnumerator AnimateImpactRing(Vector3 origin,float size)
    {
        if(presentationPaused) yield return WaitForPresentation();
        var obj=new GameObject("Cinematic silver ripple");obj.transform.SetParent(transform);
        var line=obj.AddComponent<LineRenderer>();line.sharedMaterial=glow;line.positionCount=48;line.loop=true;
        line.shadowCastingMode=ShadowCastingMode.Off;line.receiveShadows=false;
        for(float t=0;t<1;t+=PresentationDelta/.55f) {
            if(presentationPaused) {yield return null;continue;}
            if(current.reducedMotion) break;
            line.widthMultiplier=(1-t)*.026f;float radius=Mathf.Lerp(.32f,size,t);
            for(int i=0;i<48;i++) {float a=i*Mathf.PI*2/48;line.SetPosition(i,new Vector3(origin.x+Mathf.Cos(a)*radius,.186f,origin.z+Mathf.Sin(a)*radius));}
            yield return null;
        }
        Destroy(obj);
    }
}
