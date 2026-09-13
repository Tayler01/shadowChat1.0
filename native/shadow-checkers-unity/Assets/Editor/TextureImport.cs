using UnityEditor;

public class TextureImport : AssetPostprocessor
{
    void OnPreprocessModel()
    {
        if(!assetPath.StartsWith("Assets/Resources/Models/")) return;
        var model=(ModelImporter)assetImporter;
        model.meshCompression=ModelImporterMeshCompression.Medium;
        model.isReadable=assetPath.Contains("Token");
        model.importAnimation=false;model.importCameras=false;model.importLights=false;
        model.materialImportMode=ModelImporterMaterialImportMode.None;
    }
    void OnPreprocessTexture()
    {
        if(!assetPath.StartsWith("Assets/Resources/Textures/")) return;
        var texture=(TextureImporter)assetImporter;
        texture.maxTextureSize=2048;texture.mipmapEnabled=true;
        texture.anisoLevel=4;texture.textureCompression=TextureImporterCompression.CompressedHQ;
        if(assetPath.Contains("Normal")) texture.textureType=TextureImporterType.NormalMap;
        if(assetPath.Contains("Rough")) texture.sRGBTexture=false;
        // Keep the 2K source/native imports; constrain the downloaded web runtime.
        var web=texture.GetPlatformTextureSettings("WebGL");
        web.name="WebGL"; web.overridden=true;
        web.maxTextureSize=assetPath.Contains("Lightmap")?2048:assetPath.Contains("Rough") || assetPath.Contains("SilverMarble")?512:1024;
        web.format=TextureImporterFormat.Automatic;
        web.textureCompression=TextureImporterCompression.CompressedHQ;
        texture.SetPlatformTextureSettings(web);
    }
}
