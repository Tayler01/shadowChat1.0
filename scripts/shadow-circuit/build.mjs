import { spawnSync } from 'node:child_process'
import path from 'node:path'
const npmCli=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const result=spawnSync(process.execPath,[npmCli,'run','build'],{
  stdio:'inherit',env:{...process.env,VITE_FEATURE_SHADOW_CIRCUIT:'true'},
})
process.exitCode=result.status??1
