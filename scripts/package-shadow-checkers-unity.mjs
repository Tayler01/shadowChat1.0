import { access, readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const root = path.resolve(process.argv[2] || 'public/games/shadow-checkers/unity')
if(await access('output/shadow-checkers-unity/build.running').then(()=>true,()=>false)) throw new Error('Unity is still building; wait for completion before packaging the app')
const files = await readdir(path.join(root, 'Build'))
const asset = async suffix => {
  const found = files.filter(name => name.endsWith(suffix))
  if (found.length !== 1) throw new Error(`Expected exactly one Unity ${suffix}, found ${found.length}`)
  const bytes = await readFile(path.join(root, 'Build', found[0]))
  return `Build/${found[0]}?v=${createHash('sha256').update(bytes).digest('hex')}`
}
const manifest = {
  loaderUrl: await asset('.loader.js'), dataUrl: await asset('.data.unityweb'),
  frameworkUrl: await asset('.framework.js.unityweb'), codeUrl: await asset('.wasm.unityweb'),
}
await writeFile(path.join(root, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
let index = await readFile(path.join(root, 'index.html'), 'utf8')
for (const url of Object.values(manifest)) {
  const versioned = url.slice('Build/'.length)
  const name = versioned.split('?')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  index = index.replace(new RegExp(`${name}(?:\\?v=[a-f0-9]+)?`, 'g'), versioned)
}
await writeFile(path.join(root, 'index.html'), index)
console.log('Unity Web runtime manifest ready')
