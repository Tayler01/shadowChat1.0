using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Rendering;

public partial class ShadowBoard
{
    Coroutine cameraMotion;
    bool introPlayed;
    int movingCount;
    bool presentationPaused;
    [Serializable] class CinematicEvent {public int version=1;public string type="cinematic";public bool busy;public string stage;}
    [Serializable] class SoundEvent {public int version=1;public string type="sound";public string cue;}
    void Sound(string cue) {Emit(new SoundEvent {cue=cue});}
    void CinematicState(bool busy,string stage) {Emit(new CinematicEvent {busy=busy,stage=stage});}
    IEnumerator RoomReveal()
    {
        CinematicState(true,"intro");
        float angle=cameraAngle*Mathf.Deg2Rad;
        var start=new Vector3(Mathf.Sin(angle+.12f)*23,10.5f,-Mathf.Cos(angle+.12f)*23);
        UpdateCamera();var end=view.transform.position;var endRotation=view.transform.rotation;
        var startRotation=Quaternion.LookRotation(new Vector3(0,2,3)-start);
        for(float elapsed=0;elapsed<3.4f;) {
            if(presentationPaused) {yield return null;continue;}
            elapsed+=Time.unscaledDeltaTime;
            if(current.reducedMotion) break;
            float t=Mathf.Clamp01((elapsed-.55f)/2.85f);t=t*t*t*(t*(t*6-15)+10);
            view.transform.position=Vector3.Lerp(start,end,t);view.transform.rotation=Quaternion.Slerp(startRotation,endRotation,t);
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
        yield return new WaitForSecondsRealtime(delay);
        if(victim==null) yield break;
        var origin=victim.transform.position;
        Sound("capture");
        StartCoroutine(ImpactRing(origin,.5f));
        for(float t=0;t<1;t+=Time.unscaledDeltaTime/.5f) {
            if(victim==null) yield break;if(current.reducedMotion) break;
            victim.transform.position=origin+new Vector3(.11f*t,Mathf.Sin(t*Mathf.PI)*.42f-t*.12f,.1f*t);
            victim.transform.localRotation=Quaternion.Euler(t*68,t*35,t*-24);
            victim.transform.localScale=Vector3.one*(1-Mathf.SmoothStep(0,1,t));yield return null;
        }
        Destroy(victim);
    }
    IEnumerator CrownReveal(Token token,Piece king)
    {
        CinematicState(true,"kinging");
        var origin=token.root.transform.position;
        StartCoroutine(ImpactRing(origin,1));
        // A separate solid marble tier descends onto the original piece.
        CreateTokenModel(token,king);
        var tiers=new System.Collections.Generic.List<Transform>();
        bool landed=false;
        foreach(Transform child in token.root.transform) if(child.name.StartsWith("Crown ")) tiers.Add(child);
        for(float t=0;t<1;t+=Time.unscaledDeltaTime/1.05f) {
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
        var obj=new GameObject("Cinematic silver ripple");obj.transform.SetParent(transform);
        var line=obj.AddComponent<LineRenderer>();line.sharedMaterial=glow;line.positionCount=48;line.loop=true;
        line.shadowCastingMode=ShadowCastingMode.Off;line.receiveShadows=false;
        for(float t=0;t<1;t+=Time.unscaledDeltaTime/.55f) {
            if(current.reducedMotion) break;
            line.widthMultiplier=(1-t)*.026f;float radius=Mathf.Lerp(.32f,size,t);
            for(int i=0;i<48;i++) {float a=i*Mathf.PI*2/48;line.SetPosition(i,new Vector3(origin.x+Mathf.Cos(a)*radius,.186f,origin.z+Mathf.Sin(a)*radius));}
            yield return null;
        }
        Destroy(obj);
    }
}
