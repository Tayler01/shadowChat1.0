using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.Rendering;

// Unity presents authoritative snapshots. Only the authenticated host submits moves.
public partial class ShadowBoard : MonoBehaviour
{
    [Serializable] public class Position { public int row; public int col; }
    [Serializable] public class Piece { public string id; public string owner; public int row; public int col; public bool king; }
    [Serializable] public class Move { public string pieceId; public Position[] path; public Position[] captures; }
    [Serializable] public class Snapshot
    {
        public int version; public string revision; public Piece[] pieces; public string viewerSlot;
        public string selectedPieceId; public Position[] destinations; public Position[] helpers;
        public Position[] lastPath; public Position[] lastCaptures; public Move lastMove;
        public bool disabled; public bool showHints; public bool reducedMotion; public bool highContrast;
        public string boardSkin; public string winner;
    }
    [Serializable] class BoardEvent { public int version = 1; public string type; public string revision; public int row; public int col; }
    [Serializable] class Projection { public int row; public int col; public float x; public float y; }
    [Serializable] class Pointer {public float x;public float y;}
    [Serializable] class ProjectionEvent { public int version = 1; public string type = "projection"; public string revision; public Projection[] squares; }
    class Token { public GameObject root; public Piece piece; public Coroutine motion; public bool moving; public Bounds pickBounds; }

    [DllImport("__Internal")] static extern void ShadowChatEvent(string payload);
    readonly Dictionary<string, Token> tokens = new Dictionary<string, Token>();
    readonly List<GameObject> highlights = new List<GameObject>();
    readonly List<Renderer> darkTiles = new List<Renderer>();
    readonly List<Renderer> lightTiles = new List<Renderer>();
    Camera view;
    Snapshot current;
    Material gold, silver, whiteMarble, blackMarble, boardWhite, boardBlack, enamel, amberStone, darkStone, slateStone, blackStone, trim, felt, glow, blueGlow, redGlow;
    float cameraAngle;
    float cameraPitch=27.144f;
    float cameraZoom=1;
    bool tactical;
    Vector2 pressPoint;
    bool pressed;
    bool ready;
    ReflectionProbe roomReflection;
    bool reflectionCaptured;
    const int MovingPieceLayer=9;
    Material contrastLight, contrastDark;
    Material engravingMaterial;
    Font engravingFont;
    readonly Dictionary<string,Mesh[]> tokenMeshes = new Dictionary<string,Mesh[]>();
    readonly List<Mesh> boardMeshes = new List<Mesh>();

    void Start()
    {
        Application.targetFrameRate = 60;
#if UNITY_WEBGL && !UNITY_EDITOR
        WebGLInput.captureAllKeyboardInput = false;
#endif
        QualitySettings.vSyncCount = 0;
        QualitySettings.pixelLightCount = 2;
        QualitySettings.shadows = ShadowQuality.All;
        QualitySettings.shadowDistance = 25;
        QualitySettings.shadowResolution = ShadowResolution.High;
        QualitySettings.antiAliasing = 2;
        BuildScene();
        ready = true;
        Emit(new BoardEvent { type = "ready" });
#if UNITY_EDITOR
        // A visible starting table in Editor; live snapshots replace this preview.
        var pieces = new List<Piece>();
        for (int r=0;r<8;r++) for(int c=0;c<8;c++)
            if ((r+c)%2==1 && (r<3 || r>4)) pieces.Add(new Piece {id="preview-"+r+"-"+c,owner=r>4?"player_one":"player_two",row=r,col=c});
        ReceiveSnapshot(JsonUtility.ToJson(new Snapshot {version=1,revision="editor",pieces=pieces.ToArray(),viewerSlot="player_one",boardSkin="cinematic",disabled=true}));
#endif
    }

    Material Metal(string name, Color color, float metallic, float smoothness)
    {
        var m=new Material(Resources.Load<Material>("InstancedMarble")); m.name=name; m.color=color; m.SetColor("_Vein",color*1.2f);
        m.SetFloat("_Metallic",metallic); m.SetFloat("_Glossiness",smoothness); return m;
    }
    Material Emission(string name, Color color)
    {
        var m=Metal(name,color,0,.4f); m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor",color*.7f); return m;
    }
    GameObject Block(string name, Vector3 position, Vector3 scale, Material material)
    {
        var o=GameObject.CreatePrimitive(PrimitiveType.Cube); o.name=name; o.transform.SetParent(transform);
        o.transform.position=position; o.transform.localScale=scale; o.GetComponent<Renderer>().sharedMaterial=material;
        return o;
    }
    void BuildScene()
    {
        gold=Metal("Amber bronze",new Color(.82f,.48f,.14f),.63f,.62f);
        silver=Metal("Moonlit steel",new Color(.36f,.48f,.61f),.66f,.66f);
        silver.color=new Color(.76f,.8f,.86f);
        whiteMarble=new Material(Resources.Load<Material>("InstancedMarble")); whiteMarble.name="Silver marble";
        whiteMarble.SetColor("_Color",new Color(.58f,.68f,.80f)); whiteMarble.SetColor("_Vein",new Color(.14f,.19f,.27f));
        whiteMarble.SetFloat("_Metallic",.03f); whiteMarble.SetFloat("_Glossiness",.84f);
        whiteMarble.SetTexture("_MainTex",Resources.Load<Texture2D>("Textures/BlackMarbleColor"));whiteMarble.SetFloat("_UseTexture",1);
        whiteMarble.SetFloat("_VeinRemap",1);whiteMarble.SetFloat("_PolishVariation",.025f);whiteMarble.SetFloat("_StoneProjection",1);
        blackMarble=new Material(Resources.Load<Material>("InstancedMarble")); blackMarble.name="Black marble";
        blackMarble.SetColor("_Color",new Color(.006f,.009f,.014f)); blackMarble.SetColor("_Vein",new Color(.40f,.46f,.51f));
        blackMarble.SetFloat("_Metallic",.02f); blackMarble.SetFloat("_Glossiness",.86f);
        blackMarble.SetTexture("_MainTex",Resources.Load<Texture2D>("Textures/BlackMarbleColor"));blackMarble.SetFloat("_UseTexture",1);
        blackMarble.SetFloat("_VeinRemap",1);blackMarble.SetFloat("_PolishVariation",.025f);blackMarble.SetFloat("_StoneProjection",1);
        boardWhite=new Material(whiteMarble); boardWhite.name="Pale marble squares";boardWhite.color=new Color(.65f,.68f,.70f);boardWhite.SetFloat("_PlanarStrength",.6f); boardWhite.SetFloat("_Glossiness",.88f);
        boardBlack=new Material(blackMarble); boardBlack.name="Obsidian marble squares";boardBlack.SetFloat("_PlanarStrength",.72f); boardBlack.SetFloat("_Glossiness",.90f);
        boardWhite.SetVector("_VeinRange",new Vector4(.015f,.20f,0,0));
        // Board UVs already encode individual stone cuts in two combined meshes.
        boardWhite.SetFloat("_StoneProjection",0);boardBlack.SetFloat("_StoneProjection",0);
        enamel=Metal("Black enamel",new Color(.025f,.035f,.047f),.2f,.55f);
        amberStone=Metal("Warm limestone",new Color(.43f,.31f,.18f),.12f,.38f);
        darkStone=Metal("Obsidian",new Color(.028f,.041f,.058f),.28f,.55f);
        slateStone=Metal("Slate",new Color(.22f,.27f,.32f),.18f,.4f);
        blackStone=Metal("Basalt",new Color(.04f,.055f,.065f),.18f,.4f);
        trim=Metal("Gilded edges",new Color(.61f,.37f,.105f),.65f,.65f);
        felt=Metal("Midnight chamber",new Color(.013f,.023f,.032f),.02f,.2f);
        glow=Emission("Legal gold",new Color(1,.69f,.16f));
        blueGlow=Emission("Previous move blue",new Color(.22f,.65f,1));
        redGlow=Emission("Capture crimson",new Color(.9f,.17f,.18f));
        RenderSettings.ambientMode=AmbientMode.Trilight;
        RenderSettings.ambientSkyColor=new Color(.17f,.15f,.13f);
        RenderSettings.ambientEquatorColor=new Color(.07f,.055f,.04f);
        RenderSettings.ambientGroundColor=new Color(.025f,.020f,.014f);
        RenderSettings.reflectionIntensity=.8f;
        view=new GameObject("Table Camera").AddComponent<Camera>(); view.transform.SetParent(transform);view.tag="MainCamera";
        view.clearFlags=CameraClearFlags.SolidColor; view.backgroundColor=new Color(.012f,.024f,.033f);
        view.orthographic=false; view.fieldOfView=43; view.nearClipPlane=.1f; view.farClipPlane=85;
        view.gameObject.AddComponent<PlanarBoardReflection>();
        view.gameObject.AddComponent<StudyColorGrade>();
        var light=new GameObject("Soft study key").AddComponent<Light>(); light.transform.SetParent(transform);
        light.type=LightType.Directional; light.color=new Color(.98f,.85f,.68f); light.intensity=.85f;
        light.transform.rotation=Quaternion.Euler(38,-45,0); light.shadows=LightShadows.Soft;
        // Leave room for quantized mobile shadow depths on rough stone. The
        // former near-zero bias exposed self-shadow patches during camera motion.
        // Preserve the same shadow map and light energy; phone motion QA remains
        // necessary because desktop captures do not reproduce every GPU artifact.
        light.shadowStrength=.82f; light.shadowBias=.05f; light.shadowNormalBias=.12f;
        var rim=new GameObject("Window fill").AddComponent<Light>(); rim.transform.SetParent(transform);
        rim.type=LightType.Directional; rim.color=new Color(.72f,.82f,1); rim.intensity=.22f;
        rim.transform.rotation=Quaternion.Euler(32,150,0);rim.renderMode=LightRenderMode.ForceVertex;
        MedievalStudy.Build(transform);
        var baseSize=new Vector3(10.1f,.7f,10.1f);
        var plinth=Block("Carved stone table",new Vector3(0,-.605f,0),Vector3.one,blackMarble);
        var baseMesh=StoneBaseMesh.Create(baseSize,.045f);boardMeshes.Add(baseMesh);
        plinth.GetComponent<MeshFilter>().sharedMesh=baseMesh;plinth.GetComponent<BoxCollider>().size=baseSize;
        var baseCut=new MaterialPropertyBlock();baseCut.SetVector("_SurfaceUV",new Vector4(.25f,.25f,0,0));
        plinth.GetComponent<Renderer>().SetPropertyBlock(baseCut);
        Block("Lower brass course",new Vector3(0,-.23f,0),new Vector3(9.75f,.065f,9.75f),trim);
        var surround=Instantiate(Resources.Load<GameObject>("Models/MarbleSurround"),transform);
        surround.transform.position=new Vector3(0,-.16f,0);
        foreach(var renderer in surround.GetComponentsInChildren<Renderer>()) renderer.sharedMaterial=blackMarble;
        Block("Board underlay",new Vector3(0,.015f,0),new Vector3(8.16f,.06f,8.16f),trim);
        BuildTiles();
        // Border engraving, coordinate marks and brass corner studs are real geometry.
        for(int i=0;i<8;i++)
        {
            Label(((char)('A'+i)).ToString(),new Vector3(i-3.5f,.045f,-4.36f),0);
            Label((8-i).ToString(),new Vector3(-4.36f,.045f,3.5f-i),0);
            Label(((char)('A'+7-i)).ToString(),new Vector3(i-3.5f,.045f,4.36f),180);
        }
        foreach(float x in new[]{-4.6f,4.6f}) foreach(float z in new[]{-4.6f,4.6f})
        {
            var stud=GameObject.CreatePrimitive(PrimitiveType.Sphere); stud.name="Corner brass rivet";
            stud.transform.SetParent(transform); stud.transform.position=new Vector3(x,.03f,z); stud.transform.localScale=new Vector3(.16f,.08f,.16f);
            stud.GetComponent<Renderer>().sharedMaterial=gold;
        }
        // Recessed accents frame the table without obscuring playable squares.
        foreach(float side in new[]{-1f,1f})
        {
            Block("Inlaid edge",new Vector3(side*4.68f,.006f,0),new Vector3(.018f,.016f,8.9f),trim);
            Block("Inlaid edge",new Vector3(0,.006f,side*4.68f),new Vector3(8.9f,.016f,.018f),trim);
        }
        UpdateCamera();
        roomReflection=new GameObject("Study reflection probe").AddComponent<ReflectionProbe>();
        roomReflection.transform.SetParent(transform); roomReflection.transform.position=new Vector3(0,1,0);
        roomReflection.mode=ReflectionProbeMode.Realtime;
        roomReflection.refreshMode=ReflectionProbeRefreshMode.ViaScripting;
        roomReflection.timeSlicingMode=ReflectionProbeTimeSlicingMode.AllFacesAtOnce;
        roomReflection.size=new Vector3(50,30,50); roomReflection.resolution=128;
        // The static room capture must never retain the opening piece positions.
        // The separate live planar reflection still includes MovingPieceLayer.
        roomReflection.boxProjection=true; roomReflection.cullingMask=~((1<<8)|(1<<MovingPieceLayer));
        contrastLight=Metal("Comfort ivory",new Color(.9f,.9f,.9f),0,.18f);
        contrastDark=Metal("Comfort charcoal",new Color(.012f,.012f,.012f),0,.18f);
    }
    void BuildTiles()
    {
        // The board never deforms. Preserve every bevel and stone cut, but send
        // the light and dark squares as two meshes in every lighting/shadow pass.
        var model=Instantiate(Resources.Load<GameObject>("Models/BoardTile"),transform);
        model.transform.localPosition=Vector3.zero;
        var groups=new[]{new List<CombineInstance>(),new List<CombineInstance>()};
        var copies=new List<Mesh>();
        foreach(var filter in model.GetComponentsInChildren<MeshFilter>()) {
            // Include the FBX root's unit conversion and authored orientation.
            var local=transform.worldToLocalMatrix*filter.transform.localToWorldMatrix;
            for(int r=0;r<8;r++) for(int c=0;c<8;c++) {
                var copy=Instantiate(filter.sharedMesh);copies.Add(copy);var uv=copy.uv;
                for(int i=0;i<uv.Length;i++) uv[i]=uv[i]*.35f+new Vector2(c*.13f,r*.17f);
                copy.uv=uv;
                for(int sub=0;sub<copy.subMeshCount;sub++) groups[(r+c)%2].Add(new CombineInstance {mesh=copy,subMeshIndex=sub,transform=Matrix4x4.Translate(Square(r,c,.11f))*local});
            }
        }
        for(int i=0;i<2;i++) {
            var mesh=new Mesh {name=i==0?"Ivory board squares":"Obsidian board squares"};
            int vertices=0;foreach(var part in groups[i]) vertices+=part.mesh.vertexCount;
            if(vertices>65535) mesh.indexFormat=IndexFormat.UInt32;
            mesh.CombineMeshes(groups[i].ToArray());boardMeshes.Add(mesh);
            var obj=new GameObject(mesh.name);obj.transform.SetParent(transform,false);obj.layer=8;
            obj.AddComponent<MeshFilter>().sharedMesh=mesh;
            var renderer=obj.AddComponent<MeshRenderer>();renderer.sharedMaterial=i==0?boardWhite:boardBlack;
            (i==0?lightTiles:darkTiles).Add(renderer);
        }
        model.SetActive(false);Destroy(model);foreach(var mesh in copies) Destroy(mesh);
    }
    void Label(string text, Vector3 position, float angle)
    {
        var label=new GameObject("Engraving "+text); label.transform.SetParent(transform); label.transform.position=position;
        label.transform.rotation=Quaternion.Euler(90,angle,0);
        var mesh=label.AddComponent<TextMesh>(); mesh.text=text; mesh.fontSize=48; mesh.characterSize=.035f;
        mesh.anchor=TextAnchor.MiddleCenter; mesh.alignment=TextAlignment.Center; mesh.color=new Color(.67f,.51f,.29f);
        if(engravingMaterial==null) {
            engravingFont=mesh.font;
            engravingFont.RequestCharactersInTexture("ABCDEFGH12345678",48,FontStyle.Normal);
            engravingMaterial=new Material(Resources.Load<Shader>("BoardEngraving"));
            RefreshEngravingAtlas(engravingFont);Font.textureRebuilt+=RefreshEngravingAtlas;
        }
        mesh.GetComponent<Renderer>().sharedMaterial=engravingMaterial;
    }
    void RefreshEngravingAtlas(Font font) {if(font==engravingFont && engravingMaterial!=null) engravingMaterial.mainTexture=font.material.mainTexture;}
    Vector3 Square(int row,int col,float y=.173f) {
        if(current!=null && current.viewerSlot=="player_two") {row=7-row;col=7-col;}
        return new Vector3(col-3.5f,y,3.5f-row);
    }
    public void ReceiveSnapshot(string json)
    {
        if(!ready) return;
        var next=JsonUtility.FromJson<Snapshot>(json);
        if(next==null || next.version!=1 || next.pieces==null || next.pieces.Length>24) return;
        view.GetComponent<StudyColorGrade>().SetHighContrast(next.highContrast);
        bool flip=current==null || current.viewerSlot!=next.viewerSlot;
        // A multi-jump king can finish on its starting square. Detect a new
        // capture through removed victims, not just final coordinates or the
        // revision (selection/preferences also create revisions).
        bool newCapture=false;
        if(next.lastMove!=null && next.lastMove.captures!=null)
            foreach(var victim in tokens.Values) {
                bool retained=Array.Exists(next.pieces,p=>p.id==victim.piece.id);
                if(!retained) {newCapture=true;break;}
            }
        bool newRevision=current==null || current.revision!=next.revision;
        current=next;
        GetComponent<MedievalStudyEffects>()?.Configure(next.reducedMotion,presentationPaused);
        if(flip) { StopCameraGestureMotion();cameraAngle=12; UpdateCamera(); }
        else if(next.reducedMotion && cameraGestureMotion!=null) { StopCameraGestureMotion();UpdateCamera(); }
        foreach(var t in lightTiles) t.sharedMaterial=next.highContrast?contrastLight:next.boardSkin=="cinematic"?boardWhite:slateStone;
        foreach(var t in darkTiles) t.sharedMaterial=next.highContrast?contrastDark:next.boardSkin=="cinematic"?boardBlack:blackStone;
        var ids=new HashSet<string>();
        foreach(var piece in next.pieces)
        {
            ids.Add(piece.id);
            if(!tokens.TryGetValue(piece.id,out var token))
            {
                token=new Token {root=new GameObject(piece.id),piece=piece}; token.root.transform.SetParent(transform);
                token.root.transform.position=Square(piece.row,piece.col); CreateTokenModel(token,piece); tokens.Add(piece.id,token);
            }
            else
            {
                bool changed=token.piece.row!=piece.row || token.piece.col!=piece.col ||
                    (newCapture && next.lastMove!=null && next.lastMove.pieceId==piece.id);
                bool crowned=piece.king && !token.piece.king;
                // A reused board can acquire a new seat without any logical move.
                // Reorient its existing meshes together with picking/highlights.
                if(flip)
                {
                    StopTokenMotion(token);
                    token.root.transform.position=Square(piece.row,piece.col);
                    token.root.transform.localRotation=Quaternion.identity;
                }
                else if(changed)
                {
                    StopTokenMotion(token);
                    if(next.reducedMotion) {token.root.transform.position=Square(piece.row,piece.col);Sound(crowned?"crown":"place");}
                    else token.motion=StartCoroutine(MoveToken(token,next.lastMove,piece,crowned));
                }
                if(piece.king!=token.piece.king && (flip || !changed || next.reducedMotion)) CreateTokenModel(token,piece);
                token.piece=piece;
            }
        }
        foreach(var id in new List<string>(tokens.Keys)) if(!ids.Contains(id))
        {
            var token=tokens[id]; tokens.Remove(id); StopTokenMotion(token);
            if(next.reducedMotion) Destroy(token.root); else StartCoroutine(CaptureToken(token.root,CaptureDelay(next.lastMove,token.piece)));
        }
        RefreshHighlights();
        if(newRevision) Emit(new BoardEvent {type="rendered",revision=next.revision});
        SendProjection();
        if(!reflectionCaptured) { reflectionCaptured=true; roomReflection.RenderProbe(); }
        if(!introPlayed) {introPlayed=true;if(!next.reducedMotion) cameraMotion=StartCoroutine(RoomReveal());else CinematicState(false,"ready");}
    }
    void CreateTokenModel(Token token, Piece piece)
    {
        foreach(Transform child in token.root.transform) Destroy(child.gameObject);
        string key=piece.king?"CrownToken":"WarToken";
        if(!tokenMeshes.TryGetValue(key,out var meshes))
        {
            var model=Instantiate(Resources.Load<GameObject>("Models/"+key),transform);
            model.transform.localPosition=Vector3.zero;model.transform.localRotation=Quaternion.identity;
            var groups=new[]{new List<CombineInstance>(),new List<CombineInstance>(),new List<CombineInstance>(),new List<CombineInstance>()};
            foreach(var filter in model.GetComponentsInChildren<MeshFilter>())
            {
                string name=filter.name;
                bool metal=name.Contains("rim") || name.Contains("inlay") || name.Contains("Stud") || name.Contains("crest") || name.Contains("Crown");
                var parts=groups[(name.StartsWith("King")?2:0)+(metal?1:0)];
                for(int sub=0;sub<filter.sharedMesh.subMeshCount;sub++)
                    parts.Add(new CombineInstance {mesh=filter.sharedMesh,subMeshIndex=sub,transform=model.transform.worldToLocalMatrix*filter.transform.localToWorldMatrix});
            }
            meshes=new Mesh[4];
            for(int i=0;i<4;i++) {meshes[i]=new Mesh {name=key+" layer "+i};if(groups[i].Count>0) meshes[i].CombineMeshes(groups[i].ToArray());}
            tokenMeshes.Add(key,meshes);model.SetActive(false);Destroy(model);
        }
        bool firstBounds=true;
        for(int i=0;i<4;i++) {
            if(meshes[i].vertexCount==0) continue;
            if(firstBounds) {token.pickBounds=meshes[i].bounds;firstBounds=false;}
            else token.pickBounds.Encapsulate(meshes[i].bounds);
            var child=new GameObject((i>=2?"Crown ":"")+(i%2==0?"Carved marble":"Silver inlay"));child.transform.SetParent(token.root.transform,false);
            child.layer=MovingPieceLayer;
            child.AddComponent<MeshFilter>().sharedMesh=meshes[i];
            child.AddComponent<MeshRenderer>().sharedMaterial=i%2==1?silver:piece.owner=="player_one"?whiteMarble:blackMarble;
            if(i%2==0) {
                // Stable mineral cuts survive movement and promotion without extra materials.
                uint cut=2166136261;
                foreach(char letter in piece.id) cut=unchecked((cut^letter)*16777619);
                var detail=new MaterialPropertyBlock();
                detail.SetVector("_SurfaceUV",new Vector4(.9f,.9f,(cut&1023)/1024f,((cut>>10)&1023)/1024f));
                child.GetComponent<MeshRenderer>().SetPropertyBlock(detail);
            }
        }
        token.pickBounds.Encapsulate(PieceCarvings.Attach(token.root.transform, piece.king, piece.owner=="player_one"));
    }
    void OnDestroy() {Font.textureRebuilt-=RefreshEngravingAtlas;Destroy(engravingMaterial);foreach(var meshes in tokenMeshes.Values) foreach(var mesh in meshes) Destroy(mesh);foreach(var mesh in boardMeshes) Destroy(mesh);PieceCarvings.Dispose();}
    void FinishTokenMotion(Token token)
    {
        token.motion=null;
        if(!token.moving) return;
        token.moving=false;movingCount=Mathf.Max(0,movingCount-1);
        CinematicState(movingCount>0,"ready");
    }
    void StopTokenMotion(Token token)
    {
        if(token.motion!=null) StopCoroutine(token.motion);
        // Unity does not guarantee iterator finally runs on StopCoroutine.
        // Explicit, idempotent cleanup prevents a seat change locking input.
        FinishTokenMotion(token);
    }
    IEnumerator MoveToken(Token token, Move move, Piece piece, bool crowned)
    {
        token.moving=true;movingCount++;CinematicState(true,"move");
        var path=move!=null && move.pieceId==piece.id && move.path!=null?move.path:new[]{new Position {row=piece.row,col=piece.col}};
        int start=path.Length>1?1:0;
        try {
            for(int i=start;i<path.Length;i++) {
                if(presentationPaused) yield return WaitForPresentation();
                var from=token.root.transform.position;var to=Square(path[i].row,path[i].col);
                bool capture=Mathf.Abs(to.x-from.x)>1.1f;float duration=capture?.58f:.46f;
                if(!capture) Sound("slide");
                for(float t=0;t<1;t+=PresentationDelta/duration) {
                    if(presentationPaused) {yield return null;continue;}
                    if(token.root==null) yield break;if(current.reducedMotion) break;
                    float ease=t*t*(3-2*t);var position=Vector3.Lerp(from,to,ease);
                    position.y+=Mathf.Sin(t*Mathf.PI)*(capture?.78f:.055f);
                    token.root.transform.position=position;
                    token.root.transform.localRotation=Quaternion.Euler(capture?Mathf.Sin(t*Mathf.PI)*-9:0,Mathf.Sin(t*Mathf.PI)*(capture?12:3),0);
                    yield return null;
                }
                token.root.transform.position=to;token.root.transform.localRotation=Quaternion.identity;
                Sound("place");
                if(capture && !current.reducedMotion) StartCoroutine(ImpactRing(to,.65f));
            }
            if(crowned) {if(current.reducedMotion) CreateTokenModel(token,piece);else yield return CrownReveal(token,piece);}
            // The final victim's flight can outlast the mover's landing.
            while(capturingCount>0) yield return null;
        } finally {
            FinishTokenMotion(token);
        }
    }
    void Ring(int row,int col, Material material, float radius, bool diamond=false)
    {
        var o=new GameObject("Board marker"); o.transform.SetParent(transform); highlights.Add(o);
        var line=o.AddComponent<LineRenderer>(); line.sharedMaterial=material; line.useWorldSpace=true;
        int count=diamond?4:40; line.positionCount=count; line.loop=true; line.widthMultiplier=diamond?.034f:.028f;
        line.shadowCastingMode=ShadowCastingMode.Off; line.receiveShadows=false;
        for(int i=0;i<count;i++) { float a=i*2*Mathf.PI/count+(diamond?Mathf.PI/4:0); line.SetPosition(i,Square(row,col,.18f)+new Vector3(Mathf.Cos(a)*radius,0,Mathf.Sin(a)*radius)); }
    }
    void Mark(Position[] positions,Material material,float radius,bool diamond=false)
    { if(positions!=null) foreach(var p in positions) Ring(p.row,p.col,material,radius,diamond); }
    void RefreshHighlights()
    {
        foreach(var o in highlights) Destroy(o); highlights.Clear(); if(current==null) return;
        Mark(current.lastPath,blueGlow,.57f,true); Mark(current.lastCaptures,redGlow,.5f,true);
        Mark(current.helpers,glow,.55f,true);
        if(current.showHints) Mark(current.destinations,glow,.18f);
        if(current.selectedPieceId!=null && tokens.TryGetValue(current.selectedPieceId,out var t)) Ring(t.piece.row,t.piece.col,glow,.43f);
    }
    public void SetCamera(string command)
    {
        if(cameraMotion!=null) {StopCoroutine(cameraMotion);cameraMotion=null;CinematicState(false,"ready");}
        if(command=="left") {cameraAngle-=25;BeginCameraGestureMotion();}
        else if(command=="right") {cameraAngle+=25;BeginCameraGestureMotion();}
        else {
            StopCameraGestureMotion();
            if(command=="tactical") tactical=!tactical;
            else { cameraAngle=12; cameraPitch=27.144f;cameraZoom=1;tactical=false; }
            UpdateCamera(); SendProjection();
        }
    }
    [Serializable] class CameraGestureDelta { public float turn;public float tilt;public float zoomRatio=1; }
    public void MoveCamera(string json)
    {
        if(presentationPaused || cameraMotion!=null || movingCount>0 || capturingCount>0) return;
        var delta=JsonUtility.FromJson<CameraGestureDelta>(json);if(delta==null)return;
        cameraAngle=Mathf.Repeat(cameraAngle+Mathf.Clamp(delta.turn,-.25f,.25f)*90,360);
        cameraPitch=Mathf.Clamp(cameraPitch+Mathf.Clamp(delta.tilt,-.3f,.3f)*Mathf.Rad2Deg,20,65);
        cameraZoom=Mathf.Clamp(cameraZoom*Mathf.Clamp(delta.zoomRatio,.75f,1.25f),.75f,1.18f);
        tactical=false;BeginCameraGestureMotion();
    }
    public void SetPaused(string value) { presentationPaused=value=="true";if(presentationPaused) pressed=false;Application.targetFrameRate=presentationPaused?5:60;GetComponent<MedievalStudyEffects>()?.Configure(current?.reducedMotion??false,presentationPaused); }
    void CameraPose(out Vector3 position,out Quaternion rotation)
    {
        float a=cameraAngle*Mathf.Deg2Rad;
        float distance=(view.aspect>1.3f?11.8f:13.8f)*Mathf.Max(1,1/Mathf.Max(.8f,view.aspect));
        // The room ceiling is at 12.2; keep the overhead lens inside the study.
        float pitch=cameraPitch*Mathf.Deg2Rad;
        // Follow an arc around the board. Clamping only Y froze the real viewing
        // angle at 42 degrees while the requested pitch kept accumulating.
        float arm=distance/Mathf.Cos(27.144f*Mathf.Deg2Rad);
        arm=Mathf.Min(arm,10.45f/Mathf.Sin(pitch),15.4f/Mathf.Cos(pitch));
        float radius=arm*Mathf.Cos(pitch),height=-.65f+arm*Mathf.Sin(pitch);
        // Optical zoom stays responsive even when the orbit meets the ceiling.
        // It also avoids pushing the lens through nearby room furnishings.
        position=new Vector3(Mathf.Sin(a)*(tactical?.01f:radius),tactical?10:height,-Mathf.Cos(a)*(tactical?.01f:radius));
        rotation=Quaternion.LookRotation(new Vector3(0,-.65f,0)-position);
    }
    void UpdateCamera()
    {
        if(view==null) return;
        CameraPose(out var position,out var rotation);
        view.orthographic=tactical;
        view.fieldOfView=43*cameraZoom;
        view.transform.SetPositionAndRotation(position,rotation);
        view.orthographicSize=Mathf.Max(5.35f,5.5f/Mathf.Max(.65f,view.aspect));
    }
    int previousWidth,previousHeight;
    public void ReceivePointer(string json)
    {
        if(presentationPaused || current==null || current.disabled || view==null || cameraMotion!=null || movingCount>0) return;
        var point=JsonUtility.FromJson<Pointer>(json);
        if(point==null || point.x<0 || point.x>1 || point.y<0 || point.y>1) return;
        SelectRay(view.ViewportPointToRay(new Vector3(point.x,point.y,0)));
    }
    void SelectRay(Ray ray)
    {
        var square=PickSquare(ray);
        if(square!=null) Emit(new BoardEvent {type="square",revision=current.revision,row=square.row,col=square.col});
    }
    Position PickSquare(Ray ray)
    {
        // A raised piece's visible top projects behind its base on the board.
        // Resolve the nearest actual token bounds before intersecting empty tiles.
        Token hit=null;float nearest=float.PositiveInfinity;
        foreach(var token in tokens.Values) {
            var root=token.root.transform;
            var localRay=new Ray(root.InverseTransformPoint(ray.origin),root.InverseTransformDirection(ray.direction));
            float distance;
            if(!token.pickBounds.IntersectRay(localRay,out distance)) continue;
            float worldDistance=Vector3.Distance(ray.origin,root.TransformPoint(localRay.GetPoint(distance)));
            if(worldDistance<nearest) {nearest=worldDistance;hit=token;}
        }
        if(hit!=null) return new Position {row=hit.piece.row,col=hit.piece.col};
        var plane=new Plane(Vector3.up,new Vector3(0,.18f,0));
        if(!plane.Raycast(ray,out float boardDistance)) return null;
        var p=ray.GetPoint(boardDistance);int col=Mathf.FloorToInt(p.x+4),row=Mathf.FloorToInt(4-p.z);
        if(current.viewerSlot=="player_two") {row=7-row;col=7-col;}
        return row>=0 && row<8 && col>=0 && col<8 ? new Position {row=row,col=col} : null;
    }
    void Update()
    {
        // A snapshot is received before its movement is visible. Acknowledge
        // presentation only once the room, pieces, victims and ripples settle.
        if(!presentationPaused && current!=null && cameraMotion==null && movingCount==0 && capturingCount==0 && rippleCount==0 && presentedRevision!=current.revision) {
            presentedRevision=current.revision;
            Emit(new BoardEvent {type="presented",revision=current.revision});
        }
        if(Screen.width!=previousWidth || Screen.height!=previousHeight)
        { previousWidth=Screen.width; previousHeight=Screen.height;if(cameraMotion==null && cameraGestureMotion==null) UpdateCamera(); SendProjection(); }
        if(presentationPaused || current==null || current.disabled || cameraMotion!=null || movingCount>0) {pressed=false;return;}
#if !UNITY_WEBGL || UNITY_EDITOR
        if(Input.GetMouseButtonDown(0)) { pressPoint=Input.mousePosition; pressed=true; }
        if(pressed && Input.GetMouseButtonUp(0))
        {
            pressed=false;
            if(Vector2.Distance(pressPoint,Input.mousePosition)>14) return;
            SelectRay(view.ScreenPointToRay(Input.mousePosition));
        }
#endif
    }
    void SendProjection()
    {
        if(current==null || view==null) return;
        var squares=new Projection[64];
        for(int r=0;r<8;r++) for(int c=0;c<8;c++)
        { var p=view.WorldToViewportPoint(Square(r,c)); squares[r*8+c]=new Projection {row=r,col=c,x=p.x,y=1-p.y}; }
        Emit(new ProjectionEvent {revision=current.revision,squares=squares});
    }
    void Emit(object value)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        ShadowChatEvent(JsonUtility.ToJson(value));
#endif
    }
}
