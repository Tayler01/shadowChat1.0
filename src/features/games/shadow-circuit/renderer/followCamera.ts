import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import type { Vector3 } from '@babylonjs/core/Maths/math.vector'

export function followCamera(camera:ArcRotateCamera,target:Vector3){
  // Babylon otherwise rebuilds the orbit from the previous world position.
  camera.setTarget(target,false,true,true)
}
