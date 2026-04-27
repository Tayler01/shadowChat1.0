import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const DEFAULT_OPENROUTER_MODEL = 'mistralai/mistral-nemo'
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini'
const SHADO_AI_EMAIL = 'shado-ai@system.shadowchat.local'
const SHADO_AI_USERNAME = 'shado_ai'
const SHADO_AI_DISPLAY_NAME = 'Shado'
const MAX_MESSAGES = 25
const MAX_CONTENT_LENGTH = 8_000
const AI_REQUEST_TIMEOUT_MS = 9_000

type AIProvider = 'openrouter' | 'openai'
type SupabaseAdminClient = ReturnType<typeof createClient>

export type AIMessage = {
  role: 'system' | 'user'
  content: string
}

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

export const createAdminClient = () => {
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

const sanitizeMessages = (messages: unknown) => {
  const safeMessages = Array.isArray(messages) ? messages.slice(0, MAX_MESSAGES) : []

  if (safeMessages.length === 0) {
    throw new Error('At least one message is required')
  }

  return safeMessages.map(entry => {
    const maybeEntry = entry as { role?: unknown; content?: unknown }
    const role = maybeEntry?.role === 'system' ? 'system' : 'user'
    const content = String(maybeEntry?.content ?? '').slice(0, MAX_CONTENT_LENGTH)
    return { role, content }
  })
}

export const requestAICompletion = async (
  messages: unknown,
  model: unknown,
) => {
  const provider = resolveProvider()
  const defaultModel = resolveDefaultModel(provider)
  const allowedModels = resolveAllowedModels(defaultModel, provider)
  const safeModel = typeof model === 'string' && allowedModels.has(model)
    ? model
    : defaultModel
  const sanitizedMessages = sanitizeMessages(messages)
  const aiConfig = resolveAIConfig(provider)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)

  try {
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
      signal: controller.signal,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`${aiConfig.label} API error: ${error}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

export const getAIAnswer = (data: unknown) => {
  const response = data as { choices?: Array<{ message?: { content?: string } }> }
  return response?.choices?.[0]?.message?.content?.trim() || ''
}

const findAuthUserByEmail = async (
  supabase: SupabaseAdminClient,
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

export const ensureShadoAIProfile = async (supabase: SupabaseAdminClient) => {
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

export const insertShadoAIMessage = async (
  supabase: SupabaseAdminClient,
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

export const extractAiMentionQuestion = (content: string) => {
  const match = content.match(/^\s*@(ai|shado|shado_ai)\b[\s:,-]*/i)
  if (!match) {
    return null
  }

  const question = content.slice(match[0].length).trim()
  return question || null
}

export const buildGroupAIRequest = (question: string): AIMessage[] => [
  {
    role: 'system',
    content:
      'You are Shado, a helpful assistant participating in ShadowChat group chat. Provide a concise answer to the user question.',
  },
  { role: 'user', content: question },
]
