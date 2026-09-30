import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import ts from 'typescript'
import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import { getShadowRunnerRuntimeManifest, SHADOW_RUNNER_ENEMY_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'

const Body = jest.requireActual('phaser/src/physics/arcade/Body')
const keys = ['prism-caster', 'gearwing-drone', 'storm-grenadier', 'sentry-sovereign'] as const

test.each(keys)('%s loads the reviewed whole-pose strip without changing its actual world body', key => {
  const runtime = SHADOW_RUNNER_ENEMY_RUNTIME[key]
  const metadata = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'source-assets/shadow-runner/rebuild/recovered-enemies-v2', `${key}.json`), 'utf8'))
  expect({ ...runtime, frameSize: runtime.frameSize ?? 128 }).toMatchObject(metadata.recommendedCatalog)
  const width = runtime.frameWidth!, height = runtime.frameSize ?? 128
  for (const flipX of [false, true]) {
    const sprite = { x: 500, y: 616, angle: 0, flipX, width, height, displayWidth: width, displayHeight: height,
      displayOriginX: width / 2, displayOriginY: height, scaleX: 1, scaleY: 1,
      frame: { realWidth: width, realHeight: height } }
    const body = new Body({ defaults: {} }, sprite)
    sprite.scaleX = runtime.scale; sprite.scaleY = runtime.scale
    body.setSize(runtime.body.width, runtime.body.height)
    body.setOffset(runtime.body.offsetX, runtime.body.offsetY)
    body.updateFromGameObject()
    const expected = metadata.legacyWorldBodyRect
    expect(body.left - sprite.x).toBeCloseTo(expected.left, 8)
    expect(body.top - sprite.y).toBeCloseTo(expected.top, 8)
    expect(body.width).toBeCloseTo(expected.width, 8)
    expect(body.height).toBeCloseTo(expected.height, 8)
    expect(body.left + body.width / 2).toBeCloseTo(sprite.x, 8)
  }
  const sheet = getShadowRunnerRuntimeManifest(SHADOW_RUNNER_LEVEL_CONFIGS['level-10']).find(asset => asset.key === key)!
  expect(sheet).toMatchObject({ type: 'spritesheet', frameWidth: width, frameHeight: height, frameCount: runtime.frameCount })
  expect(runtime.asset).toBe(`/${metadata.runtimePath.replace(/^public\//, '')}`)
  const bytes = fs.readFileSync(path.join(process.cwd(), metadata.runtimePath))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(metadata.stripSha256)
})

test('Sovereign hit and attack animations address their reviewed pose ownership', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'source-assets/shadow-runner/rebuild/recovered-enemies-v2/sentry-sovereign.json'), 'utf8'))
  const source = fs.readFileSync(path.join(process.cwd(), 'src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts'), 'utf8')
  const ast = ts.createSourceFile('runtime.ts', source, ts.ScriptTarget.Latest, true)
  const frames = new Map<string, number>()
  const property = (node: ts.ObjectLiteralExpression, name: string) => node.properties
    .find((item): item is ts.PropertyAssignment => ts.isPropertyAssignment(item) && item.name.getText(ast) === name)?.initializer
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const key = property(node, 'key'), items = property(node, 'frames')
      if (key && ts.isStringLiteral(key) && items && ts.isArrayLiteralExpression(items) && items.elements.length === 1) {
        const item = items.elements[0]
        const frame = ts.isObjectLiteralExpression(item) ? property(item, 'frame') : undefined
        if (frame && ts.isNumericLiteral(frame)) frames.set(key.text, Number(frame.text))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  expect(metadata.frames[frames.get('sovereign-hit')!].name).toBe('hit')
  expect(metadata.frames[frames.get('sovereign-attack')!].name).toBe('enraged')
  expect(metadata.frames[frames.get('sovereign-defeated')!].name).toBe('defeated')
})
