import test from 'node:test'
import assert from 'node:assert/strict'
import {CameraGesture,DEFAULT_CAMERA,moveCamera,MIN_TILT,MAX_TILT} from '../src/features/games/shadow-circuit/input/cameraGesture.ts'
import {screenDirection} from '../src/features/games/shadow-circuit/core/types.ts'

test('drag is continuous, wraps through 360 degrees and is independent of event frequency',()=>{
  function drag(steps){
    const gesture=new CameraGesture();let view={...DEFAULT_CAMERA}
    gesture.start(1,{x:20,y:20})
    for(let i=1;i<=steps;i++)view=moveCamera(view,gesture.move(1,{x:20+480*i/steps,y:20+40*i/steps},400,400))
    return view
  }
  const one=drag(1),many=drag(60)
  assert.ok(Math.abs(one.heading-.8)<1e-12)
  assert.ok(Math.abs(one.heading-many.heading)<1e-12)
  assert.ok(Math.abs(one.tilt-many.tilt)<1e-12)
  assert.equal(moveCamera(one,{tilt:-100}).tilt,MIN_TILT)
  assert.equal(moveCamera(one,{tilt:100}).tilt,MAX_TILT)
})
test('pinch zoom does not rotate and lifting either finger rebases without a jump',()=>{
  for(const lifted of [1,2]){
    const g=new CameraGesture();g.start(1,{x:50,y:100});g.start(2,{x:150,y:100})
    assert.equal(g.start(3,{x:250,y:100}),false)
    assert.equal(g.move(3,{x:300,y:100},400,400),null)
    const delta=g.move(2,{x:200,y:100},400,400)
    assert.deepEqual(delta,{zoomRatio:2/3})
    const view=moveCamera(DEFAULT_CAMERA,delta)
    assert.equal(view.zoom,3);assert.equal(view.heading,0);assert.equal(view.tilt,.64)
    g.end(lifted)
    const survivor=lifted===1?2:1,x=survivor===1?50:200
    assert.deepEqual(g.move(survivor,{x:x+10,y:100},400,400),{turn:.1,tilt:0})
    g.clear();assert.equal(g.move(survivor,{x:x+100,y:100},400,400),null)
  }
})
test('pinches cannot exceed zoom bounds or generate infinities at zero separation',()=>{
  const g=new CameraGesture();g.start(1,{x:50,y:50});g.start(2,{x:50,y:50})
  assert.equal(g.move(2,{x:51,y:50},400,400),null)
  assert.equal(moveCamera(DEFAULT_CAMERA,{zoomRatio:.001}).zoom,2.5)
  assert.equal(moveCamera(DEFAULT_CAMERA,{zoomRatio:100}).zoom,6)
})
test('grid movement follows the nearest camera quarter without fractional directions',()=>{
  for(const heading of [-4.2,-.6,0,.23,.51,1.2,2.8,3.9,4.1,8.5]){
    for(let d=0;d<4;d++){
      const mapped=screenDirection(d,heading)
      assert.ok(Number.isInteger(mapped)&&mapped>=0&&mapped<4)
    }
  }
  assert.equal(screenDirection(0,.49),0)
  assert.equal(screenDirection(0,.51),1)
  assert.equal(screenDirection(0,3.8),0)
})
