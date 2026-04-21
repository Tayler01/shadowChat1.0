import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_MODELS = new Set(['gpt-4o-mini'])
const DEFAULT_MODEL = 'gpt-4o-mini'
const MAX_MESSAGES = 25
const MAX_CONTENT_LENGTH = 8_000

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
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

    const { messages, model } = await req.json()
    const safeModel = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL
    const safeMessages = Array.isArray(messages) ? messages.slice(0, MAX_MESSAGES) : []

    if (safeMessages.length === 0) {
      throw new Error('At least one message is required')
    }

    const sanitizedMessages = safeMessages.map(entry => {
      const role = entry?.role === 'system' ? 'system' : 'user'
      const content = String(entry?.content ?? '').slice(0, MAX_CONTENT_LENGTH)
      return { role, content }
    })

    const openaiApiKey =
      Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
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
      throw new Error(`OpenAI API error: ${error}`)
    }

    const data = await response.json()

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
