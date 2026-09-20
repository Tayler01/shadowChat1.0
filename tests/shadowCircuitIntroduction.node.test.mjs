import test from 'node:test'
import assert from 'node:assert/strict'
import {introductionAt,FLYOVER_MS} from '../src/features/games/shadow-circuit/renderer/levelIntroduction.ts'
test('a complete flyover and three full seconds precede play',()=>{
  assert.equal(introductionAt(0,false).phase,'cinematic')
  assert.deepEqual(introductionAt(FLYOVER_MS,false),{progress:1,count:3,phase:'countdown'})
  for(const [ms,count] of [[0,3],[999,3],[1000,2],[1999,2],[2000,1],[2999,1]])assert.equal(introductionAt(FLYOVER_MS+ms,false).count,count)
  assert.equal(introductionAt(FLYOVER_MS+3000,false).phase,'playing')
})
test('reduced motion skips camera movement but retains the complete countdown',()=>{
  assert.deepEqual(introductionAt(0,true),{progress:1,count:3,phase:'countdown'})
  assert.equal(introductionAt(2999,true).phase,'countdown')
  assert.equal(introductionAt(3000,true).phase,'playing')
})
