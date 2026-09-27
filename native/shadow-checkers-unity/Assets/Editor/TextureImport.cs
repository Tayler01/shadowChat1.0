using UnityEditor;

public class TextureImport : AssetPostprocessor
{
    void OnPreprocessModel()
    {
        if(!assetPath.StartsWith("Assets/Resources/Models/")) return;
        var model=(ModelImporter)assetImporter;
        model.meshCompression=ModelImporterMeshCompression.Medium;
        // Keep small wax rims and embossed lettering intact across room-sized bounds.
        if(assetPath.Contains("StudyMetals") || assetPath.Contains("StudyLeather") || assetPath.Contains("StudyPaper") || assetPath.Contains("StudyMaps") || assetPath.Contains("StudyBindings") || assetPath.Contains("StudyStone"))
            model.meshCompression=ModelImporterMeshCompression.Low;
        if(assetPath.Contains("StudyWax"))
            model.meshCompression=ModelImporterMeshCompression.Off;
        model.isReadable=assetPath.Contains("Token") || assetPath.Contains("BoardTile");
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
        // Foreground maps/books have dedicated detail now; the remaining small
        // furnishings no longer need a 2K lighting atlas.
        bool detailedAtlas=assetPath.Contains("StudyArchitectureLightmap") || assetPath.Contains("BookSpines") || assetPath.Contains("StudyMap");
        bool fineNormal=assetPath.Contains("Rough") || assetPath.Contains("SilverMarble") || assetPath.Contains("OakNormal") || assetPath.Contains("HearthStoneNormal");
        web.maxTextureSize=detailedAtlas?2048:fineNormal?512:1024;
        // One shared, mipmapped grain map for the table folios and library.
        if(assetPath.Contains("LeatherRough")) web.maxTextureSize=256;
        if(assetPath.Contains("StudyPortrait")) web.maxTextureSize=512;
        // Preserve resolution with a mobile-native format. Desktop browsers that
        // lack ASTC use Unity's decoded fallback; verify that path in browser QA.
        web.format=TextureImporterFormat.ASTC_6x6;
        web.textureCompression=TextureImporterCompression.CompressedHQ;
        texture.SetPlatformTextureSettings(web);
    }
}
