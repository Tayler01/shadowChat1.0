import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createAdminClient,
  ensureShadoAIProfile,
  getAIAnswer,
  insertShadoAIMessage,
  requestAICompletion,
} from '../_shared/ai.ts'
import {
  authenticateEdgeUser,
  claimEdgeRequest,
  completeEdgeRequestClaim,
  consumeEdgeRateLimit,
  deterministicRequestKey,
  EdgeAuthenticationError,
  EdgeRateLimitError,
  failEdgeRequestClaim,
  waitForEdgeRequestClaim,
} from '../_shared/edge-guard.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const POST_TO_CHAT_RECENT_COMMAND_WINDOW_MS = 2 * 60 * 1000
const DEFAULT_POST_TO_CHAT_HOURLY_LIMIT = 10
const DEFAULT_AI_REQUESTS_PER_MINUTE = 20
const AI_CLAIM_SCOPE = 'openai-chat'

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

const json = (
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
    ...extraHeaders,
  },
})

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

const resolveAIRequestsPerMinute = () => {
  const configured = Number(Deno.env.get('AI_REQUESTS_PER_MINUTE') ?? '')
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_AI_REQUESTS_PER_MINUTE
  }

  return Math.min(Math.floor(configured), 120)
}

const validatePostToChat = async (
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  messages: unknown,
): Promise<{ response: Response } | { sourceMessageId: string }> => {
  const { data: banned, error: banError } = await supabase.rpc('is_user_channel_banned', {
    target_user_id: userId,
    scope: 'general_chat',
  })

  if (banError) {
    throw banError
  }

  if (banned) {
    return { response: forbidden('You cannot post AI replies to General Chat while banned from General Chat.') }
  }

  const requestedQuestion = extractLatestUserQuestion(messages)
  if (!requestedQuestion) {
    return { response: forbidden('Posting AI replies to chat requires a user question.') }
  }

  const recentSince = new Date(Date.now() - POST_TO_CHAT_RECENT_COMMAND_WINDOW_MS).toISOString()
  const { data: recentCommands, error: recentCommandError } = await supabase
    .from('messages')
    .select('id, content')
    .eq('user_id', userId)
    .gte('created_at', recentSince)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(10)

  if (recentCommandError) {
    throw recentCommandError
  }

  const normalizedRequestedQuestion = normalizeQuestion(requestedQuestion)
  const matchingRecentCommand = (recentCommands ?? []).find(row => {
    const commandQuestion = extractAiCommandQuestion((row as { content?: unknown }).content)
    return commandQuestion && normalizeQuestion(commandQuestion) === normalizedRequestedQuestion
  })

  if (!matchingRecentCommand) {
    return { response: forbidden('Posting AI replies to chat requires a recent @ai message from the requester.') }
  }

  return { sourceMessageId: String((matchingRecentCommand as { id: unknown }).id) }
}

const replayClaimResponse = (claim: {
  response_status: number | null
  response_body: unknown
}) => json(
  claim.response_body,
  claim.response_status ?? 200,
  { 'X-Idempotent-Replay': 'true' },
)

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await authenticateEdgeUser(req)
    const { messages, model, post_to_chat: postToChatSnake, postToChat } = await req.json()
    const shouldPostToChat = Boolean(postToChatSnake ?? postToChat)
    const supabase = createAdminClient()
    let sourceMessageId: string | null = null

    if (shouldPostToChat) {
      const validation = await validatePostToChat(supabase, user.id, messages)
      if ('response' in validation) {
        return validation.response
      }
      sourceMessageId = validation.sourceMessageId
    }

    const requestKey = sourceMessageId
      ? `chat-message:${sourceMessageId}`
      : `request:${await deterministicRequestKey({ messages, model: model ?? null })}`
    const claim = await claimEdgeRequest(supabase, {
      userId: user.id,
      scope: AI_CLAIM_SCOPE,
      key: requestKey,
      leaseSeconds: 120,
      retentionSeconds: 24 * 60 * 60,
    })

    if (!claim.acquired) {
      if (claim.status === 'completed') return replayClaimResponse(claim)
      const completedClaim = await waitForEdgeRequestClaim(supabase, {
        userId: user.id,
        scope: AI_CLAIM_SCOPE,
        key: requestKey,
        timeoutMs: 15_000,
      })
      if (completedClaim?.status === 'completed') {
        return replayClaimResponse(completedClaim)
      }
      return json(
        { error: 'This AI request is already processing. Retry shortly.' },
        409,
        { 'Retry-After': '2' },
      )
    }

    const claimToken = claim.claim_token
    if (!claimToken) throw new Error('AI request claim did not return an owner token')

    try {
      await consumeEdgeRateLimit(supabase, {
        userId: user.id,
        scope: 'openai-chat:minute',
        windowSeconds: 60,
        limit: resolveAIRequestsPerMinute(),
        message: 'Too many AI requests. Please wait a moment and try again.',
      })

      if (shouldPostToChat) {
        const hourlyLimit = resolvePostToChatHourlyLimit()
        await consumeEdgeRateLimit(supabase, {
          userId: user.id,
          scope: 'openai-chat:post-hour',
          windowSeconds: 60 * 60,
          limit: hourlyLimit,
          message: `You can ask Shado to post ${hourlyLimit} replies per hour for now.`,
        })
      }

      const data = await requestAICompletion(messages, model)
      const answer = getAIAnswer(data)
      let responseBody: unknown = data

      if (shouldPostToChat && answer) {
        const shadoProfile = await ensureShadoAIProfile(supabase)
        const insertedMessage = await insertShadoAIMessage(supabase, shadoProfile.id, answer)
        responseBody = {
          ...(data as Record<string, unknown>),
          shado_message: insertedMessage,
        }
      }

      await completeEdgeRequestClaim(supabase, {
        userId: user.id,
        scope: AI_CLAIM_SCOPE,
        key: requestKey,
        claimToken,
        responseStatus: 200,
        responseBody,
      })
      return json(responseBody)
    } catch (error) {
      if (error instanceof EdgeRateLimitError) {
        await failEdgeRequestClaim(supabase, {
          userId: user.id,
          scope: AI_CLAIM_SCOPE,
          key: requestKey,
          claimToken,
          errorMessage: error.message,
        }).catch(() => undefined)
        return json({ error: error.message }, 429, {
          'Retry-After': String(error.retryAfterSeconds),
        })
      }

      await failEdgeRequestClaim(supabase, {
        userId: user.id,
        scope: AI_CLAIM_SCOPE,
        key: requestKey,
        claimToken,
        errorMessage: error instanceof Error ? error.message : 'AI request failed',
      }).catch(() => undefined)
      throw error
    }
  } catch (error) {
    if (error instanceof EdgeAuthenticationError) {
      return unauthorized(error.message)
    }
    if (error instanceof EdgeRateLimitError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(error.retryAfterSeconds),
        },
      })
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
