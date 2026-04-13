import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Env } from "../types/env";

declare const Deno: Env;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "false",
  // include 'Prefer' because the Supabase client may send this header
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
};

type ClientInfo = {
  userAgent: string;
  browser: string;
  os: string;
  device: string;
};

type AuthLogPayload =
  | {
      event: "register";
      userId: string;
    }
  | {
      event: "login_success";
      userId: string;
      clientInfo: ClientInfo;
    }
  | {
      event: "login_failure";
      userId?: string | null;
      email?: string;
      clientInfo: ClientInfo;
      reason: string;
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

const getClientIp = (headers: Headers): string => {
  const fromForwarded = headers.get("x-forwarded-for");
  if (fromForwarded) {
    const [firstIp] = fromForwarded.split(",");
    if (firstIp && firstIp.trim()) {
      return firstIp.trim();
    }
  }

  const headerCandidates = [
    "x-real-ip",
    "cf-connecting-ip",
    "cf-ray",
    "true-client-ip",
    "forwarded",
    "fly-client-ip",
    "fastly-client-ip",
    "x-cluster-client-ip",
  ];

  for (const header of headerCandidates) {
    const value = headers.get(header);
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return headers.get("client-ip")?.trim() || "unknown";
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

Deno.serve(async (req: { method: string; json: () => AuthLogPayload | PromiseLike<AuthLogPayload>; headers: Headers; }) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  let payload: AuthLogPayload;
  try {
    payload = (await req.json()) as AuthLogPayload;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const ipAddress = getClientIp(req.headers);

  try {
    switch (payload.event) {
      case "register": {
        if (!payload.userId) {
          return jsonResponse(400, { error: "Missing userId" });
        }

        const { error } = await adminClient
          .from("users")
          .update({ origin_ip: ipAddress })
          .eq("id", payload.userId);

        if (error) {
          console.error("Failed to update user origin IP", error);
          return jsonResponse(500, { error: "Failed to update user profile" });
        }
        break;
      }

      case "login_success": {
        if (!payload.userId || !payload.clientInfo) {
          return jsonResponse(400, { error: "Missing userId or clientInfo" });
        }

        const [historyResult, activityResult] = await Promise.all([
          adminClient.from("login_history").insert({
            user_id: payload.userId,
            ip_address: ipAddress,
            user_agent: payload.clientInfo.userAgent,
            browser: payload.clientInfo.browser,
            os: payload.clientInfo.os,
            device: payload.clientInfo.device,
            success: true,
            failure_reason: null,
            suspicious: false,
          }),
          adminClient.from("activity_logs").insert({
            user_id: payload.userId,
            action: "login",
            resource_type: "auth",
            ip_address: ipAddress,
          }),
        ]);

        if (historyResult.error) {
          console.error("Failed to insert login history", historyResult.error);
        }

        if (activityResult.error) {
          console.error("Failed to insert activity log", activityResult.error);
        }

        break;
      }

      case "login_failure": {
        if (!payload.clientInfo || !payload.reason) {
          return jsonResponse(400, { error: "Missing failure metadata" });
        }

        const { error } = await adminClient.from("login_history").insert({
          user_id: payload.userId ?? null,
          ip_address: ipAddress,
          user_agent: payload.clientInfo.userAgent,
          browser: payload.clientInfo.browser,
          os: payload.clientInfo.os,
          device: payload.clientInfo.device,
          success: false,
          failure_reason: payload.reason,
          suspicious: false,
        });

        if (error) {
          console.error("Failed to insert failed login record", error);
        }

        break;
      }

      default:
        return jsonResponse(400, { error: "Unknown event type" });
    }

    return jsonResponse(200, { success: true, ip: ipAddress });
  } catch (error) {
    console.error("Unexpected error handling auth event", error);
    return jsonResponse(500, { error: "Internal Server Error" });
  }
});
