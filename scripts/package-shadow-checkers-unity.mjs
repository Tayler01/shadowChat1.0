import { access, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('public/games/shadow-checkers/unity')
if(await access('output/shadow-checkers-unity/build.running').then(()=>true,()=>false)) throw new Error('Unity is still building; wait for completion before packaging the app')
const files = await readdir(path.join(root, 'Build'))
const asset = suffix => {
  const found = files.filter(name => name.endsWith(suffix))
  if (found.length !== 1) throw new Error(`Expected exactly one Unity ${suffix}, found ${found.length}`)
  return `Build/${found[0]}`
}
await writeFile(path.join(root, 'build-manifest.json'), JSON.stringify({
  loaderUrl: asset('.loader.js'), dataUrl: asset('.data.unityweb'),
  frameworkUrl: asset('.framework.js.unityweb'), codeUrl: asset('.wasm.unityweb'),
}, null, 2) + '\n')
console.log('Unity Web runtime manifest ready')
