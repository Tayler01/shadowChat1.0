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

const POST_TO_CHAT_RECENT_COMMAND_WINDOW_MS = 2 * 60 * 1000
const DEFAULT_POST_TO_CHAT_HOURLY_LIMIT = 10

const unauthorized = (message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const forbidden = (message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const tooManyRequests = (message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status: 429,
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

const normalizeQuestion = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase()

const extractAiCommandQuestion = (content: unknown) => {
  const value = typeof content === 'string' ? content : ''
  const match = value.match(/^\s*@(ai|shado|shado_ai)\b[\s:,-]*/i)
  if (!match) return null
  const question = value.slice(match[0].length).trim()
  return question || null
}

const extractLatestUserQuestion = (messages: unknown) => {
  if (!Array.isArray(messages)) return null

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index] as { role?: unknown; content?: unknown } | null
    if (entry?.role === 'user' && typeof entry.content === 'string') {
      const question = entry.content.trim()
      if (question) return question
    }
  }

  return null
}

const resolvePostToChatHourlyLimit = () => {
  const configured = Number(Deno.env.get('AI_POST_TO_CHAT_HOURLY_LIMIT') ?? '')
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_POST_TO_CHAT_HOURLY_LIMIT
  }

  return Math.min(Math.floor(configured), 100)
}

const validatePostToChat = async (
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  messages: unknown,
) => {
  const { data: banned, error: banError } = await supabase.rpc('is_user_channel_banned', {
    target_user_id: userId,
    scope: 'general_chat',
  })

  if (banError) {
    throw banError
  }

  if (banned) {
    return forbidden('You cannot post AI replies to General Chat while banned from General Chat.')
  }

  const requestedQuestion = extractLatestUserQuestion(messages)
  if (!requestedQuestion) {
    return forbidden('Posting AI replies to chat requires a user question.')
  }

  const recentSince = new Date(Date.now() - POST_TO_CHAT_RECENT_COMMAND_WINDOW_MS).toISOString()
  const { data: recentCommands, error: recentCommandError } = await supabase
    .from('messages')
    .select('id, content')
    .eq('user_id', userId)
    .gte('created_at', recentSince)
    .order('created_at', { ascending: false })
    .limit(10)

  if (recentCommandError) {
    throw recentCommandError
  }

  const normalizedRequestedQuestion = normalizeQuestion(requestedQuestion)
  const hasMatchingRecentCommand = (recentCommands ?? []).some(row => {
    const commandQuestion = extractAiCommandQuestion((row as { content?: unknown }).content)
    return commandQuestion && normalizeQuestion(commandQuestion) === normalizedRequestedQuestion
  })

  if (!hasMatchingRecentCommand) {
    return forbidden('Posting AI replies to chat requires a recent @ai message from the requester.')
  }

  const hourlyLimit = resolvePostToChatHourlyLimit()
  const quotaSince = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: quotaError } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', quotaSince)
    .or('content.ilike.@ai%,content.ilike.@shado%,content.ilike.@shado_ai%')

  if (quotaError) {
    throw quotaError
  }

  if ((count ?? 0) > hourlyLimit) {
    return tooManyRequests(`You can ask Shado to post ${hourlyLimit} replies per hour for now.`)
  }

  return null
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
    const supabase = shouldPostToChat ? createAdminClient() : null
    if (supabase) {
      const validationResponse = await validatePostToChat(supabase, id, messages)
      if (validationResponse) {
        return validationResponse
      }
    }

    const data = await requestAICompletion(messages, model)
    const answer = getAIAnswer(data)

    if (supabase && answer) {
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
