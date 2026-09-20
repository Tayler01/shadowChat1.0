import test from 'node:test'
import assert from 'node:assert/strict'
import {isLevelOpen,levelIdentity,passwordMatch} from '../src/features/games/shadow-circuit/content/progression.ts'
import {AUTHORED_LEVELS} from '../src/features/games/shadow-circuit/content/authoredLevels.ts'
const [first,second,third]=AUTHORED_LEVELS
const profile=()=>({results:[],unlocked:[],checkpoint:null})
test('only the first level is open in a fresh campaign',()=>{
  assert.equal(isLevelOpen(first,AUTHORED_LEVELS,null),true)
  assert.equal(isLevelOpen(second,AUTHORED_LEVELS,null),false)
  assert.equal(isLevelOpen(third,AUTHORED_LEVELS,null),false)
})
test('a genuine previous clear opens only the next level with matching content',()=>{
  const p=profile();p.results.push({levelId:first.id,contentHash:first.contentHash})
  assert.equal(isLevelOpen(second,AUTHORED_LEVELS,p),true)
  assert.equal(isLevelOpen(third,AUTHORED_LEVELS,p),false)
  p.results[0].contentHash='changed';assert.equal(isLevelOpen(second,AUTHORED_LEVELS,p),false)
})
test('password unlock is specific to a level/content and awards no completion',()=>{
  const p=profile();p.unlocked.push(levelIdentity(second))
  assert.equal(isLevelOpen(second,AUTHORED_LEVELS,p),true)
  assert.equal(isLevelOpen(third,AUTHORED_LEVELS,p),false)
  assert.equal(p.results.length,0)
  assert.deepEqual(passwordMatch(AUTHORED_LEVELS,' brdg '),[second])
  assert.deepEqual(passwordMatch(AUTHORED_LEVELS,'BRDG',third),[])
  assert.deepEqual(passwordMatch(AUTHORED_LEVELS,''),[])
})
