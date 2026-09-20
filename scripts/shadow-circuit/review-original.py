"""Generate a private, inspectable atlas from the user's DAT parser output.
No original maps, titles, hints or passwords are written to public assets.
"""
import csv
import html
import json
from collections import Counter
from pathlib import Path

SOURCE = Path('tools/shadow-circuit/private-originals/chips.raw.json')
OUT = Path('output/shadow-circuit/original-review')
OUT.mkdir(parents=True, exist_ok=True)
source = json.loads(SOURCE.read_text(encoding='utf-8'))
names = {t['id']: t['semantic'] for t in json.loads(Path('docs/shadow-circuit-build/manifests/legacy_tiles.json').read_text())['tiles']}
colors = ['#10c6df', '#ec3b30', '#22c632', '#e4d524']

def tile_style(tile):
    if tile == 0: return '#c5c5c5', ''
    if tile in [1, 5, 31, 37, 44]: return '#676767', '' if tile == 1 else names[tile][:1]
    if tile == 2: return '#d0d0d0', 'IC'
    if tile == 3: return '#13bce9', '~'
    if tile == 4: return '#ff682a', 'F'
    if tile in [10, 14, 15, 16, 17]: return '#865934', 'B'
    if tile == 11: return '#9e7048', '.'
    if tile == 12 or 26 <= tile <= 29: return '#97f4ff', ['SE','SW','NW','NE'][tile-26] if tile>=26 else '~'
    if tile in [13, 18, 19, 20, 50]: return '#1ba42c', {13:'v',18:'^',19:'>',20:'<',50:'?'}[tile]
    if 22 <= tile <= 25: return colors[tile-22], 'L'
    if 100 <= tile <= 103: return colors[tile-100], 'K'
    if tile >= 108: return '#f3f3f3', 'P'
    if 64 <= tile <= 99: return '#ec93b1', names[tile][:2]
    if 104 <= tile <= 107: return '#e3efdc', ['FL','FB','SK','SU'][tile-104]
    return {21:('#3750ed','E'),34:('#ede57e','S'),41:('#697ded','T'),42:('#e72514','!'),43:('#997352','TR'),47:('#f1ef39','?'),49:('#796297','CL')}.get(tile,('#d3a9ed',names[tile][:2]))

def svg(level):
    cells=[]
    for index,tile in enumerate(level['upper']):
        x,y=(index%32)*20,(index//32)*20
        color,label=tile_style(tile)
        lower=level['lower'][index]
        tip=f'{index%32},{index//32}: {names[tile]}; lower {names[lower]}'
        cells.append(f'<g><title>{html.escape(tip)}</title><rect x="{x}" y="{y}" width="20" height="20" fill="{color}" stroke="#eee" stroke-width=".5"/>')
        if label: cells.append(f'<text x="{x+10}" y="{y+14}" text-anchor="middle" font-family="monospace" font-size="10" font-weight="bold">{html.escape(label)}</text>')
        if lower: cells.append(f'<circle cx="{x+17}" cy="{y+3}" r="2" fill="#000"/>')
        cells.append('</g>')
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">'+''.join(cells)+'</svg>'

rows=[]; review=[]; aggregate=Counter()
for level in source['levels']:
    fields=level['optionalFields'];number=level['sourceLevelNumber']
    title=next((f.get('text','') for f in fields if f['type']==3),str(number))
    hint=next((f.get('text','') for f in fields if f['type']==7),'')
    counts=Counter(level['upper'])+Counter(t for t in level['lower'] if t)
    aggregate.update(counts)
    positions=lambda ids:[{'x':i%32,'y':i//32,'tile':names[t],'layer':layer} for layer in ['upper','lower'] for i,t in enumerate(level[layer]) if t in ids]
    mechanisms=[f for f in fields if f['type'] in [4,5,10]]
    row={'number':number,'title':title,'time':level['timeLimitSeconds'],'requiredChips':level['requiredChips'],'availableChips':counts[2],
         **{f'{kind}-{color}':counts[base+i] for kind,base in [('key',100),('door',22)] for i,color in enumerate(['blue','red','green','yellow'])},
         'stackedCells':sum(t!=0 for t in level['lower']),'actors':sum(counts[t] for t in range(64,100)),
         'layout':'BOTH_LAYERS_DECODED','mechanics':'INVENTORIED_NOT_CERTIFIED','solution':'NOT_RUN'}
    rows.append(row)
    details={**row,'hint':hint,'tileCounts':{names[t]:n for t,n in sorted(counts.items()) if t},'keysAndDoors':positions(list(range(22,26))+list(range(100,104))),
             'mechanismFields':mechanisms,'stackedTiles':[{'x':i%32,'y':i//32,'upper':names[level['upper'][i]],'lower':names[t]} for i,t in enumerate(level['lower']) if t]}
    review.append(details)
    (OUT/f'level-{number:03}.svg').write_text(svg(level),encoding='utf-8')

(OUT/'level-review.json').write_text(json.dumps({'sourceSha256':source['sourceSha256'],'review':review},indent=2),encoding='utf-8')
with (OUT/'levels.csv').open('w',newline='',encoding='utf-8') as stream:
    writer=csv.DictWriter(stream,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
payload=json.dumps(review).replace('<','\\u003c')
page='''<!doctype html><html><meta charset="utf-8"><title>Original campaign reference</title>
<style>body{font:16px system-ui;margin:0;background:#0a3212;color:#f0f4ea}header{padding:22px;background:#08250d;position:sticky;top:0}h1{margin:0 0 8px}select,button{font:inherit;padding:9px}main{display:grid;grid-template-columns:minmax(400px,720px) 1fr;gap:24px;padding:24px}img{width:100%;image-rendering:pixelated}pre{white-space:pre-wrap;font:13px monospace}p{line-height:1.5}a{color:#aeef97}@media(max-width:800px){main{grid-template-columns:1fr}}</style>
<header><h1>Chip’s Challenge — original campaign reference</h1><p>Private local source. All 149 layouts and both layers decoded; this inventory does not certify gameplay or solutions.</p><button id="prev">←</button> <select id="level" aria-label="Level"></select> <button id="next">→</button> <a href="levels.csv">Inventory CSV</a></header><main><div><img id="map"><p>P: player · IC: chip · K: key · L: lock · B: block · E: exit · S: socket. Black corner dots indicate a nonempty lower layer. Open an SVG separately and hover a cell for both tile names and coordinates.</p><a id="svg">Open full map</a></div><section><h2 id="title"></h2><p id="summary"></p><p id="hint"></p><pre id="details"></pre></section></main><script>const levels=DATA;const select=document.querySelector('#level');levels.forEach((l,i)=>select.add(new Option(l.number+' · '+l.title,i)));function show(){const l=levels[select.value];const file='level-'+String(l.number).padStart(3,'0')+'.svg';document.querySelector('#map').src=file;document.querySelector('#svg').href=file;document.querySelector('#title').textContent=l.title;document.querySelector('#summary').textContent=l.time+' seconds · '+l.requiredChips+' chips required · '+l.stackedCells+' lower-layer cells';document.querySelector('#hint').textContent=l.hint;document.querySelector('#details').textContent=JSON.stringify({tiles:l.tileCounts,keysAndDoors:l.keysAndDoors,mechanisms:l.mechanismFields,stacked:l.stackedTiles},null,2);}select.onchange=show;document.querySelector('#prev').onclick=()=>{select.value=Math.max(0,+select.value-1);show()};document.querySelector('#next').onclick=()=>{select.value=Math.min(levels.length-1,+select.value+1);show()};show();</script></html>'''.replace('DATA',payload)
(OUT/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'levels':len(rows),'keys':sum(aggregate[i] for i in range(100,104)),'doors':sum(aggregate[i] for i in range(22,26)),
                  'levelsWithStacking':sum(r['stackedCells']>0 for r in rows),'uniqueTiles':len(aggregate),'atlas':str(OUT/'index.html')}))
