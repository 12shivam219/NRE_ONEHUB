// @ts-ignore - URL imports are resolved by Deno at runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore - URL imports are resolved by Deno at runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "false",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    detectSessionInUrl: false,
  },
});

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use admin client to check if email exists in auth.users.
    // NOTE: listUsers is paginated and returns { users: [...] }.
    const normalized = email.toLowerCase();
    const perPage = 1000;
    let page = 1;
    let emailExists = false;

    while (!emailExists) {
      const { data, error: listError } = await adminClient.auth.admin.listUsers({ page, perPage });

      if (listError) {
        console.error("Error listing users:", listError);
        return new Response(JSON.stringify({ error: "Unable to verify email" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // esm.sh typings can be loose here; keep this function strict-safe.
      const users = (data?.users ?? []) as Array<{ email?: string | null }>;
      emailExists = users.some((user) => (user.email ?? "").toLowerCase() === normalized);

      // If we've reached the last page (fewer than perPage users), stop.
      if (users.length < perPage) break;
      page += 1;
    }

    return new Response(
      JSON.stringify({ exists: emailExists }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
