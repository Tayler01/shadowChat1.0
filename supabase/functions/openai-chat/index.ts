import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_OPENROUTER_MODEL = 'mistralai/mistral-nemo'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const SHADO_AI_EMAIL = 'shado-ai@system.shadowchat.local'
const SHADO_AI_USERNAME = 'shado_ai'
const SHADO_AI_DISPLAY_NAME = 'Shado'
const MAX_MESSAGES = 25
const MAX_CONTENT_LENGTH = 8_000
type AIProvider = 'openrouter' | 'openai'

const unauthorized = (message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) {
      return unauthorized('Authentication required')
    }

    const env = getSupabaseEnv()
    const supabaseUrl = env.supabaseUrl
    const supabaseAnonKey = env.supabaseAnonKey
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase environment variables are not configured')
    }

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

    const provider = resolveProvider()
    const defaultModel = resolveDefaultModel(provider)
    const allowedModels = resolveAllowedModels(defaultModel, provider)
    const { messages, model, post_to_chat: postToChatSnake, postToChat } = await req.json()
    const shouldPostToChat = Boolean(postToChatSnake ?? postToChat)
    const safeModel = typeof model === 'string' && allowedModels.has(model)
      ? model
      : defaultModel
    const safeMessages = Array.isArray(messages) ? messages.slice(0, MAX_MESSAGES) : []

    if (safeMessages.length === 0) {
      throw new Error('At least one message is required')
    }

    const sanitizedMessages = safeMessages.map(entry => {
      const role = entry?.role === 'system' ? 'system' : 'user'
      const content = String(entry?.content ?? '').slice(0, MAX_CONTENT_LENGTH)
      return { role, content }
    })

    const aiConfig = resolveAIConfig(provider)
    const response = await fetch(aiConfig.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aiConfig.apiKey}`,
        'Content-Type': 'application/json',
        ...aiConfig.headers,
      },
      body: JSON.stringify({
        model: safeModel,
        messages: sanitizedMessages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`${aiConfig.label} API error: ${error}`)
    }

    const data = await response.json()
    const answer = data?.choices?.[0]?.message?.content?.trim()
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

const parseCsv = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)

const getSupabaseEnv = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey }
}

const createAdminClient = () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseEnv()
  if (!serviceRoleKey) {
    throw new Error('Supabase service role key not configured')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const resolveProvider = (): AIProvider => {
  const configured = (Deno.env.get('AI_PROVIDER') ?? '').trim().toLowerCase()
  if (configured === 'openrouter' || configured === 'openai') {
    return configured
  }

  return Deno.env.get('OPENROUTER_API_KEY') ? 'openrouter' : 'openai'
}

const resolveDefaultModel = (provider: AIProvider) => {
  const configuredModel = Deno.env.get('AI_MODEL')
  if (configuredModel) {
    return configuredModel
  }

  if (provider === 'openrouter') {
    return Deno.env.get('OPENROUTER_MODEL') || DEFAULT_OPENROUTER_MODEL
  }

  return DEFAULT_OPENAI_MODEL
}

const resolveAllowedModels = (defaultModel: string, provider: AIProvider) => {
  const configuredModels = parseCsv(Deno.env.get('AI_ALLOWED_MODELS'))
  const providerDefaultModel = provider === 'openrouter'
    ? DEFAULT_OPENROUTER_MODEL
    : DEFAULT_OPENAI_MODEL

  return new Set([
    defaultModel,
    providerDefaultModel,
    ...configuredModels,
  ])
}

const resolveAIConfig = (provider: AIProvider) => {
  if (provider === 'openrouter') {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured')
    }

    return {
      apiKey,
      label: 'OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      headers: {
        'HTTP-Referer':
          Deno.env.get('OPENROUTER_SITE_URL') || 'https://shadowchat-1-0.netlify.app',
        'X-OpenRouter-Title': Deno.env.get('OPENROUTER_APP_NAME') || 'ShadowChat',
      },
    }
  }

  const apiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('AI API key not configured')
  }

  return {
    apiKey,
    label: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {},
  }
}

const findAuthUserByEmail = async (
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
) => {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    })

    if (error) {
      throw error
    }

    const match = data.users.find(user =>
      user.email?.toLowerCase() === email.toLowerCase()
    )

    if (match || data.users.length < 1000) {
      return match ?? null
    }
  }

  return null
}

const ensureShadoAIProfile = async (supabase: ReturnType<typeof createAdminClient>) => {
  const { data: existingProfiles, error: existingProfileError } = await supabase
    .from('users')
    .select('id')
    .or(`email.eq.${SHADO_AI_EMAIL},username.eq.${SHADO_AI_USERNAME}`)
    .limit(1)

  if (existingProfileError) {
    throw existingProfileError
  }

  let shadoUserId = existingProfiles?.[0]?.id as string | undefined

  if (!shadoUserId) {
    const existingAuthUser = await findAuthUserByEmail(supabase, SHADO_AI_EMAIL)
    shadoUserId = existingAuthUser?.id
  }

  if (!shadoUserId) {
    const { data: createdUser, error: createUserError } =
      await supabase.auth.admin.createUser({
        email: SHADO_AI_EMAIL,
        password: crypto.randomUUID() + crypto.randomUUID(),
        email_confirm: true,
        user_metadata: {
          username: SHADO_AI_USERNAME,
          display_name: SHADO_AI_DISPLAY_NAME,
          full_name: SHADO_AI_DISPLAY_NAME,
          account_type: 'ai_assistant',
        },
      })

    if (createUserError) {
      throw createUserError
    }

    shadoUserId = createdUser.user?.id
  }

  if (!shadoUserId) {
    throw new Error('Unable to create Shado AI profile')
  }

  const { data, error } = await supabase
    .from('users')
    .upsert({
      id: shadoUserId,
      email: SHADO_AI_EMAIL,
      username: SHADO_AI_USERNAME,
      display_name: SHADO_AI_DISPLAY_NAME,
      full_name: SHADO_AI_DISPLAY_NAME,
      avatar_url: null,
      color: '#D4AF37',
      chat_color: '#D4AF37',
      status: 'online',
      status_message: 'AI assistant',
      last_active: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return data as { id: string }
}

const insertShadoAIMessage = async (
  supabase: ReturnType<typeof createAdminClient>,
  shadoUserId: string,
  content: string,
) => {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      user_id: shadoUserId,
      content,
      message_type: 'command',
    })
    .select(`
      *,
      user:users!user_id(*)
    `)
    .single()

  if (error) {
    throw error
  }

  return data
}
