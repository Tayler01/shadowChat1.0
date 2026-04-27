import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createAdminClient,
  ensureShadoAIProfile,
  getAIAnswer,
  insertShadoAIMessage,
  requestAICompletion,
} from '../_shared/ai.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const unauthorized = (message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const getSupabaseEnv = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return { supabaseUrl, supabaseAnonKey }
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) {
      return unauthorized('Authentication required')
    }

    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
    const token = authorization.replace(/^Bearer\s+/i, '')
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })

    if (!authResponse.ok) {
      return unauthorized('Invalid or expired session')
    }

    const { id } = await authResponse.json()
    if (!id) {
      return unauthorized('Invalid or expired session')
    }

    const { messages, model, post_to_chat: postToChatSnake, postToChat } = await req.json()
    const shouldPostToChat = Boolean(postToChatSnake ?? postToChat)
    const data = await requestAICompletion(messages, model)
    const answer = getAIAnswer(data)

    if (shouldPostToChat && answer) {
      const supabase = createAdminClient()
      const shadoProfile = await ensureShadoAIProfile(supabase)
      const insertedMessage = await insertShadoAIMessage(supabase, shadoProfile.id, answer)

      return new Response(JSON.stringify({
        ...data,
        shado_message: insertedMessage,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
