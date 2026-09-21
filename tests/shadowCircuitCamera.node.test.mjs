import test from 'node:test'
import assert from 'node:assert/strict'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { followCamera } from '../src/features/games/shadow-circuit/renderer/followCamera.ts'

test('following across a level preserves tilt, distance and each manually selected heading',()=>{
  const engine=new NullEngine(),scene=new Scene(engine)
  try {
    const camera=new ArcRotateCamera('test',Math.PI/2,.52,11.8,new Vector3(4,.1,4),scene)
    for(const heading of [0,.013,.46,1,1.89,2.6,3,3.99]){
      camera.alpha=Math.PI/2+heading*Math.PI/2
      const expected=[camera.alpha,camera.beta,camera.radius]
      for(const [x,z] of [[5,4],[5,12],[20,12],[20,26],[4,4]]){
        followCamera(camera,new Vector3(x,.1,z))
        camera.getViewMatrix(true)
        assert.deepEqual([camera.alpha,camera.beta,camera.radius],expected)
        assert.deepEqual(camera.target.asArray(),[x,.1,z])
      }
    }
  }finally{scene.dispose();engine.dispose()}
})
