"""Regenerate only the corrected terrain models; preserve all other exports."""
from pathlib import Path
builder = Path(__file__).with_name('build_calibration.py')
exec(compile(builder.read_text(encoding='utf-8').split("box('stone-body'")[0], str(builder), 'exec'))
exec(compile(Path(__file__).with_name('hero_reference.py').read_text(encoding='utf-8').split('def smooth_box')[0], 'hero_reference.py', 'exec'))

selected = {'terrain-exit', 'terrain-teleport', *('terrain-force-'+str(tile) for tile in (13,18,19,20,50))}
original_export = export_asset
def export_asset(asset_id, ceiling):
    if asset_id in selected:
        original_export(asset_id, ceiling)
    else:
        for obj in parts:
            bpy.data.objects.remove(obj, do_unlink=True)
        parts.clear()

exec(compile(Path(__file__).with_name('terrain_reference.py').read_text(encoding='utf-8'), 'terrain_reference.py', 'exec'))
metadata = json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
replacements = {asset['id']:asset for asset in assets}
metadata['assets'] = [replacements.get(asset['id'],asset) for asset in metadata['assets']]
(OUT/'manifest.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'regenerated':sorted(replacements)}))
