import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

export const badRequest = (message: string) => json({ error: message }, 400)
export const unauthorized = (message: string) => json({ error: message }, 401)
export const forbidden = (message: string) => json({ error: message }, 403)
export const notFound = (message: string) => json({ error: message }, 404)
export const conflict = (message: string) => json({ error: message }, 409)

const getEnv = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey }
}

export const getSupabaseAdmin = () => {
  const { supabaseUrl, serviceRoleKey } = getEnv()

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export const authenticateRequest = async (req: Request) => {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) {
    return { error: unauthorized('Authentication required') }
  }

  const { supabaseUrl, supabaseAnonKey } = getEnv()
  const token = authorization.replace(/^Bearer\s+/i, '')

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  })

  if (!authResponse.ok) {
    return { error: unauthorized('Invalid or expired session') }
  }

  const user = await authResponse.json()
  if (!user?.id) {
    return { error: unauthorized('Invalid or expired session') }
  }

  return { userId: user.id as string }
}

export const readJson = async <T>(req: Request): Promise<T> => {
  return await req.json() as T
}

export const normalizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

export const generatePairingCode = (length = 8) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const random = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(random, byte => alphabet[byte % alphabet.length]).join('')
}
