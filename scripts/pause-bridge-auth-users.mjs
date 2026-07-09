import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!process.argv.includes('--apply')) {
  console.log('Bridge Auth hold script is inert without --apply.')
  process.exit(0)
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: devices, error: deviceError } = await admin
  .from('bridge_devices')
  .select('bridge_user_id')
  .not('bridge_user_id', 'is', null)

if (deviceError) throw deviceError

const bridgeUserIds = [...new Set(
  (devices ?? [])
    .map(device => device.bridge_user_id)
    .filter(value => typeof value === 'string' && value.length > 0)
)]

for (const bridgeUserId of bridgeUserIds) {
  const { error } = await admin.auth.admin.updateUserById(bridgeUserId, {
    password: randomBytes(48).toString('base64url'),
    ban_duration: '876000h',
  })
  if (error) throw error
}

console.log(`Bridge Auth hold applied to ${bridgeUserIds.length} dedicated account(s).`)
