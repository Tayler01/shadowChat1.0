import type { CircuitLevel } from '../core/types.ts'
import type { DeviceProfile } from '../persistence/deviceStore.ts'
export const levelIdentity=(level:CircuitLevel)=>`${level.id}:${level.contentHash}`
export function isLevelOpen(level:CircuitLevel,levels:CircuitLevel[],profile:DeviceProfile|null){
  const campaign=levels.filter(item=>item.campaignId===level.campaignId)
  const index=campaign.findIndex(item=>item.id===level.id&&item.contentHash===level.contentHash)
  if(index===0)return true
  if(profile?.unlocked?.includes(levelIdentity(level)))return true
  if(profile?.checkpoint?.levelId===level.id)return true
  return !!profile?.results.some(result=>result.levelId===campaign[index-1]?.id&&result.contentHash===campaign[index-1]?.contentHash||result.levelId===level.id&&result.contentHash===level.contentHash)
}
export function passwordMatch(levels:CircuitLevel[],code:string,target?:CircuitLevel|null){
  const normalized=code.trim().toUpperCase()
  return (target?[target]:levels).filter(level=>level.password&&level.password.toUpperCase()===normalized)
}
