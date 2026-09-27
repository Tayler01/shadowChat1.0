using UnityEngine;

// One full-screen pass. The camera owns intermediate targets; no blur pyramid,
// temporal history, LUT download or per-frame material allocations are needed.
[RequireComponent(typeof(Camera))]
public sealed class StudyColorGrade : MonoBehaviour
{
    Material grade;
    bool highContrast;
    public RenderTextureFormat SourceFormat {get;private set;}
    public void SetHighContrast(bool value) {highContrast=value;}
    void OnEnable()
    {
        GetComponent<Camera>().allowHDR=SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.DefaultHDR);
        var shader=Resources.Load<Shader>("StudyToneMap");
        if(shader!=null && shader.isSupported) grade=new Material(shader) {hideFlags=HideFlags.HideAndDontSave};
    }
    void OnRenderImage(RenderTexture source,RenderTexture destination)
    {
        SourceFormat=source.format;
        if(grade==null || highContrast) Graphics.Blit(source,destination);
        else Graphics.Blit(source,destination,grade);
    }
    void OnDisable() {if(grade!=null) Destroy(grade);grade=null;}
}
