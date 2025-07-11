import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const firebaseConfig = {
    apiKey: Deno.env.get('FIREBASE_API_KEY'),
    authDomain: Deno.env.get('FIREBASE_AUTH_DOMAIN'),
    projectId: Deno.env.get('FIREBASE_PROJECT_ID'),
    storageBucket: Deno.env.get('FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: Deno.env.get('FIREBASE_MESSAGING_SENDER_ID'),
    appId: Deno.env.get('FIREBASE_APP_ID'),
  }

  const vapidKey = Deno.env.get('FCM_VAPID_KEY')

  return new Response(
    JSON.stringify({ firebaseConfig, vapidKey }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
