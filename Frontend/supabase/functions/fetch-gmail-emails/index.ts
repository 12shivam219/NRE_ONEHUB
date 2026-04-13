import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl!, supabaseServiceKey!);

interface FetchEmailsRequest {
  userId: string;
  maxResults?: number;
  query?: string;
}

interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  content: string;
}

async function getGmailAccessToken(userId: string): Promise<string> {
  // Fetch the user's Gmail refresh token from auth.user_metadata
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);

  if (userError) {
    console.error("User lookup error:", userError);
    throw new Error(`Failed to lookup user: ${userError.message}`);
  }

  if (!userData.user) {
    throw new Error("User not found");
  }

  const refreshToken = userData.user.user_metadata?.gmail_refresh_token;

  if (!refreshToken) {
    console.error("Gmail refresh token not found in user metadata:", {
      userId,
      metadata: userData.user.user_metadata,
    });
    throw new Error("Gmail is not connected. Please connect your Gmail account in Settings > Email Connections.");
  }

  // Exchange refresh token for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json().catch(() => ({}));
    console.error("Token refresh failed:", errorData);
    throw new Error("Failed to refresh Gmail access token. Please reconnect your Gmail account.");
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function fetchGmailMessages(
  accessToken: string,
  maxResults: number = 10,
  query: string = ""
): Promise<EmailMessage[]> {
  // List messages
  const listUrl = new URL("https://www.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", String(maxResults));
  if (query) {
    listUrl.searchParams.set("q", query);
  }

  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listResponse.ok) {
    throw new Error("Failed to fetch Gmail messages list");
  }

  const listData = await listResponse.json();
  const messageIds = listData.messages?.map((m: { id: string }) => m.id) || [];

  // Fetch full message content for each message
  const messages: EmailMessage[] = [];

  for (const messageId of messageIds) {
    try {
      const messageResponse = await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!messageResponse.ok) continue;

      const messageData = await messageResponse.json();
      const headers = messageData.payload?.headers || [];

      const getHeader = (name: string) =>
        headers.find((h: { name: string; value: string }) => h.name === name)?.value || "";

      const content =
        messageData.payload?.parts?.find(
          (p: { mimeType: string }) => p.mimeType === "text/plain"
        )?.body?.data ||
        messageData.payload?.body?.data ||
        "";

      const decodedContent = content
        ? atob(content.replace(/-/g, "+").replace(/_/g, "/"))
        : "";

      messages.push({
        id: messageId,
        threadId: messageData.threadId,
        subject: getHeader("Subject"),
        from: getHeader("From"),
        date: getHeader("Date"),
        content: decodedContent,
      });
    } catch (error) {
      console.error(`Failed to fetch message ${messageId}:`, error);
    }
  }

  return messages;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey, prefer",
            },
        });
    }

    try {
        const { userId, maxResults = 20, query = "job OR hiring OR position" } = await req.json() as FetchEmailsRequest;

        if (!userId) {
            return new Response(JSON.stringify({ error: "userId is required" }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            });
        }

        // Get Gmail access token
        const accessToken = await getGmailAccessToken(userId);

        // Fetch emails
        const emails = await fetchGmailMessages(accessToken, maxResults, query);

        return new Response(JSON.stringify({ success: true, emails }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : "Unknown error",
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    }
});
