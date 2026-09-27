import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Load later definitions verbatim without replaying unrelated feature DDL.
// These fixtures deliberately exclude the full Auth/Realtime deployment stack.
export async function applyCheckersSqlOverrides(db, names, after, before='9999') {
  const applied=[]
  for(const file of (await readdir('supabase/migrations')).sort()) {
    if(file<=after||file>=before||!file.endsWith('.sql'))continue
    const sql=await readFile(`supabase/migrations/${file}`,'utf8')
    const definitions=[...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?\bAS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)[\s\S]*?\2\s*;/gi)].filter(match=>names.has(match[1]))
    for(const definition of definitions)await db.exec(definition[0])
    if(definitions.length)applied.push({file,functions:definitions.map(match=>match[1]),sha256:createHash('sha256').update(sql).digest('hex')})
  }
  return applied
}
