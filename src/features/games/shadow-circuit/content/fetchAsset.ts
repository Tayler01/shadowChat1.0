export async function fetchAsset(asset:{url:string;sha256:string;bytes:number},signal?:AbortSignal) {
  const response=await fetch(asset.url,{signal})
  if(!response.ok)throw new Error('A game asset could not be loaded. Check your connection and retry.')
  const bytes=await response.arrayBuffer()
  const digest=await crypto.subtle.digest('SHA-256',bytes)
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
  if(bytes.byteLength!==asset.bytes||hash!==asset.sha256)throw new Error('A game asset did not match this version. Please retry.')
  return bytes
}
