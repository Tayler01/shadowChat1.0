import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface Payload {
  table: string
  record: Record<string, any>
  type: string
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
  const fcmKey = Deno.env.get('FCM_SERVER_KEY')

  if (!supabaseUrl || !serviceRole || !fcmKey) {
    console.error('Missing environment configuration')
    return new Response('Server configuration error', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRole)
  let recipientIds: string[] = []

  if (payload.table === 'dm_messages') {
    const { data } = await supabase
      .from('dm_conversations')
      .select('participants')
      .eq('id', payload.record.conversation_id)
      .single()

    if (data) {
      recipientIds = (data.participants as string[]).filter((id) => id !== payload.record.sender_id)
    }
  } else if (payload.table === 'messages') {
    const { data } = await supabase
      .from('users')
      .select('id')

    if (data) {
      recipientIds = data.map((u) => u.id).filter((id) => id !== payload.record.user_id)
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

  const body = {
    registration_ids: tokens.map((t) => t.token),
    notification: {
      title: 'New message',
      body: payload.record.content,
    },
    data: {
      table: payload.table,
      id: payload.record.id,
    },
  }

  await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `key=${fcmKey}`,
    },
    body: JSON.stringify(body),
  })

  return new Response('ok')
})
