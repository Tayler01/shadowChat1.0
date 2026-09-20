export type DeviceCheckpoint = { levelId: string; runId: string; state: string; hash: string; revision: number }
export type DeviceResult = { runId: string; levelId: string; contentHash: string; ruleset: string; elapsed: number; moves: number; assisted: boolean }
export type CircuitSettings = { music: boolean; sfx: boolean; mirror: boolean; largeControls: boolean; quality: 'balanced' | 'battery' }
export const DEFAULT_SETTINGS: CircuitSettings = { music: true, sfx: true, mirror: false, largeControls: false, quality: 'balanced' }
export type DeviceProfile = { version: 1; checkpoint: DeviceCheckpoint | null; previous: DeviceCheckpoint | null; results: DeviceResult[]; settings: CircuitSettings; unlocked:string[] }
const fresh = ():DeviceProfile => ({version:1,checkpoint:null,previous:null,results:[],settings:{...DEFAULT_SETTINGS},unlocked:[]})
let opening: Promise<IDBDatabase> | null = null
// Hashing is asynchronous: serialize calls before hashing so an older autosave
// cannot overtake a newer checkpoint or resurrect a finished run.
const queues = new Map<string, Promise<void>>()
function enqueue(owner:string, write:()=>Promise<void>) {
  const result=(queues.get(owner)??Promise.resolve()).catch(()=>undefined).then(write)
  queues.set(owner,result)
  void result.finally(()=>{if(queues.get(owner)===result)queues.delete(owner)}).catch(()=>undefined)
  return result
}
function database() {
  opening ??= new Promise<IDBDatabase>((resolve,reject)=>{
    if(!globalThis.indexedDB){reject(new Error('Device storage is unavailable.'));return}
    const request=indexedDB.open('shadowchat-shadow-circuit-v1',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('profiles')
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opening=null};resolve(request.result)}
    request.onerror=()=>{opening=null;reject(request.error??new Error('Device storage could not be opened.'))}
    request.onblocked=()=>reject(new Error('Close another Shadow Circuit tab to update device storage.'))
  }).catch(error=>{opening=null;throw error})
  return opening
}
export async function stateDigest(text:string) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')
}
export async function loadProfile(owner:string):Promise<DeviceProfile> {
  const db=await database()
  const profile=await new Promise<DeviceProfile>((resolve,reject)=>{
    const transaction=db.transaction('profiles','readonly');const request=transaction.objectStore('profiles').get(owner)
    request.onsuccess=()=>resolve(request.result??fresh());request.onerror=()=>reject(request.error)
  })
  if(profile.version!==1||!Array.isArray(profile.results)||profile.results.length>10000)throw new Error('Device save format requires recovery.')
  for(const field of ['checkpoint','previous'] as const) {
    const record=profile[field]
    if(record && (typeof record.state!=='string'||record.state.length>512000||await stateDigest(record.state)!==record.hash))profile[field]=null
  }
  profile.checkpoint??=profile.previous
  profile.settings={...DEFAULT_SETTINGS,...profile.settings}
  profile.unlocked=Array.isArray(profile.unlocked)?profile.unlocked.filter(value=>typeof value==='string').slice(0,10000):[]
  return profile
}
async function changeProfile(owner:string,change:(current:DeviceProfile)=>DeviceProfile) {
  const db=await database()
  return new Promise<void>((resolve,reject)=>{
    const transaction=db.transaction('profiles','readwrite');const store=transaction.objectStore('profiles');const request=store.get(owner)
    request.onsuccess=()=>{try{store.put(change(request.result??fresh()),owner)}catch{transaction.abort()}}
    transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error??new Error('Device save failed.'))
    transaction.onabort=()=>reject(transaction.error??new Error('Device save was interrupted.'))
  })
}
export function saveCheckpoint(owner:string,record:Omit<DeviceCheckpoint,'hash'|'revision'>) {
  return enqueue(owner,async()=>{
    const hash=await stateDigest(record.state)
    await changeProfile(owner,profile=>profile.results.some(r=>r.runId===record.runId)?profile:({...profile,previous:profile.checkpoint,checkpoint:{...record,hash,revision:(profile.checkpoint?.revision??0)+1}}))
  })
}
export function saveResult(owner:string,result:DeviceResult) {
  return enqueue(owner,()=>changeProfile(owner,profile=>({...profile,checkpoint:profile.checkpoint?.runId===result.runId?null:profile.checkpoint,previous:profile.previous?.runId===result.runId?null:profile.previous,results:profile.results.some(r=>r.runId===result.runId)?profile.results:[...profile.results,result].slice(-10000)})))
}
export function saveSettings(owner:string,settings:CircuitSettings) { return enqueue(owner,()=>changeProfile(owner,profile=>({...profile,settings}))) }
export function unlockLevel(owner:string,identity:string){return enqueue(owner,()=>changeProfile(owner,profile=>({...profile,unlocked:Array.from(new Set([...(profile.unlocked??[]),identity])).slice(-10000)})))}
