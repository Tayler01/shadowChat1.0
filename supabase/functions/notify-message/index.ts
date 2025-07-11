import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface Payload {
  table: string
  record: Record<string, any>
  type: string
}

function base64UrlEncode(data: Uint8Array) {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const lines = pem.trim().split('\n')
  const base64 = lines.slice(1, -1).join('')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

async function getAccessToken(serviceAccount: {
  client_email: string
  private_key: string
}) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const iat = Math.floor(Date.now() / 1000)
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  }
  const encoder = new TextEncoder()
  const encodedHeader = base64UrlEncode(
    encoder.encode(JSON.stringify(header)),
  )
  const encodedPayload = base64UrlEncode(
    encoder.encode(JSON.stringify(payload)),
  )
  const unsigned = `${encodedHeader}.${encodedPayload}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      encoder.encode(unsigned),
    ),
  )
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token request failed: ${err}`)
  }
  const data = await res.json()
  return data.access_token as string
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const payload = await req.json() as Payload

  if (payload.type !== 'INSERT') {
    return new Response('ignored')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const serviceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT')

  if (!supabaseUrl || !serviceRole || !serviceAccountJson) {
    console.error('Missing environment configuration')
    return new Response('Server configuration error', { status: 500 })
  }

  const serviceAccount = JSON.parse(serviceAccountJson)

  const supabase = createClient(supabaseUrl, serviceRole)
  let recipientIds: string[] = []

  if (payload.table === 'dm_messages') {
    const { data } = await supabase
      .from('dm_conversations')
      .select('participants')
      .eq('id', payload.record.conversation_id)
      .single()

    if (data) {
      recipientIds = (data.participants as string[]).filter(
        (id) => id !== payload.record.sender_id,
      )
    }
  } else if (payload.table === 'messages') {
    const { data } = await supabase
      .from('users')
      .select('id')

    if (data) {
      recipientIds = data.map((u) => u.id).filter(
        (id) => id !== payload.record.user_id,
      )
    }
  }

  if (recipientIds.length === 0) {
    return new Response('ok')
  }

  const { data: tokens } = await supabase
    .from('user_devices')
    .select('token')
    .in('user_id', recipientIds)

  if (!tokens || tokens.length === 0) {
    return new Response('ok')
  }

  let accessToken: string
  try {
    accessToken = await getAccessToken(serviceAccount)
  } catch (err) {
    console.error('Failed to obtain access token', err)
    return new Response('Server configuration error', { status: 500 })
  }

  for (const t of tokens) {
    const body = {
      message: {
        token: t.token,
        notification: {
          title: 'New message',
          body: payload.record.content,
        },
        data: {
          table: payload.table,
          id: String(payload.record.id),
        },
      },
    }

    await fetch(
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; UTF-8',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      },
    )
  }

  return new Response('ok')
})
