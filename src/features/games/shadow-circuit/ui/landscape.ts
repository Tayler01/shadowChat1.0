type LockableOrientation=ScreenOrientation&{lock?:(orientation:'landscape')=>Promise<void>}
let ownedFullscreen=false
export async function enterCircuitLandscape(){
  if(typeof window==='undefined')return
  // Called synchronously from the launcher gesture; iOS uses the rotate gate.
  try{if(!document.fullscreenElement&&document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen();ownedFullscreen=true}}catch{/* Browser/installed PWA may not need fullscreen. */}
  try{await (screen.orientation as LockableOrientation|undefined)?.lock?.('landscape')}catch{/* Keep the rotate gate visible where locking is unsupported. */}
}
export function leaveCircuitLandscape(){
  try{screen.orientation?.unlock?.()}catch{/* Unsupported orientation API. */}
  if(ownedFullscreen&&document.fullscreenElement)void document.exitFullscreen().catch(()=>undefined)
  ownedFullscreen=false
}
