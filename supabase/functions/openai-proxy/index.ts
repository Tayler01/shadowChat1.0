import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const OPENAI_KEY = Deno.env.get("OPENAI_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Check if OpenAI key is configured
    if (!OPENAI_KEY) {
      console.error("OPENAI_KEY environment variable is not set");
      return new Response(
        JSON.stringify({ 
          error: "OpenAI API key not configured",
          message: "The OpenAI API key is not set in the environment variables"
        }),
        {
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders
          },
        }
      );
    }

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON",
          message: "Request body must be valid JSON"
        }),
        {
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders
          },
        }
      );
    }

    // Make request to OpenAI
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    
    // Log response status for debugging
    console.log(`OpenAI API response status: ${res.status}`);
    
    if (!res.ok) {
      console.error(`OpenAI API error: ${res.status} - ${text}`);
    }

    return new Response(text, {
      status: res.status,
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      },
    });

  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders
        },
      }
    );
  }
});