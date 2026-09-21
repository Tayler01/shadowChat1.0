export function tileVisual(tile:number):string|null {
  if([1,0x2c,5].includes(tile))return tile===5||tile===0x2c?null:'wall'
  if(tile===30||tile===31)return 'blue-wall'
  if(tile===37)return 'toggle-closed';if(tile===38)return 'toggle-open'
  if([6,7,8,9,48].includes(tile))return `thin-${tile}`
  if(tile===2)return 'chip';if(tile===3)return 'water';if(tile===4)return 'fire'
  if(tile===12)return 'ice';if(tile>=26&&tile<=29)return `ice-${tile}`;if([13,18,19,20,50].includes(tile))return `force-${tile}`
  if(tile===21)return 'exit';if(tile>=22&&tile<=25)return `door-${tile-22}`
  if(tile>=100&&tile<=103)return `key-${tile-100}`;if(tile>=104&&tile<=107)return `boot-${tile-104}`
  if(tile===34)return 'socket';if(tile===41)return 'teleport';if(tile===11)return 'dirt';if(tile===47)return 'hint'
  if([35,36,39,40].includes(tile))return `button-${tile}`
  if(tile===42)return 'bomb';if(tile===43)return 'trap';if(tile===49)return 'cloner'
  if(tile===33)return 'thief';if(tile===45)return 'gravel';if(tile===46)return 'popup'
  return null
}
