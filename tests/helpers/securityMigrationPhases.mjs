import { readFile } from 'node:fs/promises'

export const securityActivationName = '20261023224455_security_privacy_activation.sql'
export const securityMigrationsUrl = new URL('../../supabase/migrations/', import.meta.url)

// Focused SQL fixtures deliberately install only the section whose prerequisite
// schema they model. The phase parity suite executes the entire migration.
export async function securityActivationSection(name) {
  const sql = await readFile(new URL(securityActivationName, securityMigrationsUrl), 'utf8')
  const start = `-- BEGIN ${name}\n`
  const end = `-- END ${name}`
  const normalized = sql.replaceAll('\r\n', '\n')
  if (normalized.split(start).length !== 2 || normalized.split(end).length !== 2) {
    throw new Error(`Missing or duplicated activation section: ${name}`)
  }
  return normalized.split(start)[1].split(end)[0]
}
