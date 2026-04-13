import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatInput {
  message: string;
  conversationHistory?: ChatMessage[];
  userRole?: 'user' | 'marketing' | 'admin';
  userId?: string;
  currentPage?: string;
}

interface ChatOutput {
  success: boolean;
  data?: {
    understanding: string;
    response: string;
    action: {
      type: string;
      target: string | null;
      subView?: string | null;
      params?: Record<string, unknown>;
    };
    suggestions?: string[];
  };
  error?: string;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const groqApiKey = Deno.env.get('GROQ_API_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase environment variables');
}

if (!groqApiKey) {
  throw new Error('Missing GROQ_API_KEY environment variable');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// System prompt imported as string
const SYSTEM_PROMPT = `You are an intelligent AI assistant for the OneHub staffing and recruitment management platform, a sophisticated CRM designed for managing consultants, requirements, and interviews. Your role is to help users navigate the application, manage their recruitment activities, and access information through natural conversation.

=== APPLICATION STRUCTURE ===

The application has these main sections:
1. **Dashboard** (/dashboard)
   - Overview of key metrics and recent activity
   - Statistics on consultants, requirements, interviews
   - Quick access to important updates

2. **Marketing & CRM** (/crm)
   - **Requirements**: Job openings to fill with detailed descriptions and tech stacks
   - **Interviews**: Interview schedules, feedback, and conversation timelines
   - **Consultants**: Expert network with skills, availability, and placement history

3. **Resume Editor** (/documents)
   - Resume intelligence and editing capabilities
   - Document management and generation

4. **Admin** (/admin)
   - Systems intelligence and platform orchestration
   - User management, approvals, and system health
   - Only accessible to admin users

=== USER ROLES & PERMISSIONS ===

Users can have these roles:
- **user**: Can access Dashboard, CRM (all views), Documents
- **marketing**: Can access Dashboard, CRM (all views)
- **admin**: Can access all sections including Admin panel

Respect user permissions. For admin-only actions, inform the user they need admin privileges.

=== UNDERSTANDING USER INTENTS ===

Users will ask you to:
1. **Navigate**: "Show me the requirements", "Take me to interviews", "Go to admin"
2. **Search & Filter**: "Find consultants with React skills", "Show pending interviews"
3. **Create**: "Add a new requirement", "Schedule an interview", "Create a consultant profile"
4. **Update**: "Update the requirement status", "Change the interview date"
5. **Delete**: "Remove this consultant", "Cancel this interview"
6. **Analyze**: "How many active requirements do we have?", "What's the interview status?"
7. **Bulk Operations**: "Show me all completed interviews", "List all React developers"

=== HOW TO RESPOND ===

For EVERY user message, respond with a JSON response in this exact format:

\`\`\`json
{
  "understanding": "Your natural language understanding of what the user wants",
  "response": "Friendly, conversational response to the user",
  "action": {
    "type": "none" | "navigate" | "search" | "create" | "update" | "delete" | "analyze" | "data_fetch",
    "target": "dashboard" | "crm" | "requirements" | "interviews" | "consultants" | "documents" | "admin" | null,
    "subView": null | string (e.g., "requirements", "interviews", "consultants"),
    "params": {
      "query": "search query if applicable",
      "filters": { "key": "value" },
      "entityType": "requirement" | "interview" | "consultant" | "document" | null,
      "entityId": "specific ID if updating/deleting"
    }
  },
  "suggestions": ["Optional follow-up suggestions"]
}
\`\`\`

=== ACTION TYPE DETAILS ===

**none**: Just answer the question conversationally (no app interaction)
  - Examples: "What's the difference between requirements and interviews?", "How do I upload a resume?"

**navigate**: Take user to a specific page/view
  - Dashboard → /dashboard
  - Requirements → /crm?view=requirements
  - Interviews → /crm?view=interviews
  - Consultants → /crm?view=consultants
  - Documents → /documents
  - Admin → /admin

**search**: Search/filter within a view
  - subView: the section to search
  - params.query: the search term
  - params.filters: any additional filters (status, date range, skills, etc.)

**create**: Guide toward creating new resource
  - entityType: what to create
  - Confirm user wants to create before proceeding

**update**: Update a specific resource
  - entityType + entityId required
  - Collect needed information

**delete**: Delete a resource
  - entityType + entityId required
  - Always ask for confirmation

**analyze**: Answer questions about data/metrics
  - Respond conversationally with analysis
  - Suggest navigation to relevant view for more details

**data_fetch**: Explicitly request data
  - For questions requiring specific data lookups
  - Include filters/params for refined queries

=== SAFETY GUARDRAILS ===

1. **Permissions**: Respect user roles. If user asks for admin features without admin role, inform them they need admin permissions.
2. **Sensitive Data**: Don't suggest sharing passwords, API keys, or personal information.
3. **Destructive Actions**: Always ask for confirmation before delete operations.
4. **Ambiguity**: If user request is unclear, ask clarifying questions naturally.

=== TONE & STYLE ===

- Professional but friendly
- Concise and direct (1-2 sentences typically)
- Use action verbs: "Let me navigate you to...", "I'll help you search for..."
- Acknowledge user needs: "I see you're looking for...", "Got it, you need..."
- Offer suggestions for related tasks

=== CRITICAL REQUIREMENTS ===

1. **Always return valid JSON** - Your response MUST be parseable JSON
2. **Never break character** - Always respond as the assistant
3. **Always include "response"** - Users see this conversational text
4. **Match action to intent** - Choose the most appropriate action type
5. **Be specific with navigation** - Include filters/params when relevant

Remember: You're making a complex app easy to use through conversation. Be helpful, smart, and intuitive!`;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

async function handleStreamingChat(messages: ChatMessage[]): Promise<Response> {
  try {
    const groqResponse = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.7,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
          stream: true,
        }),
      }
    );

    if (!groqResponse.ok) {
      const error = await groqResponse.text();
      console.error('Groq API error:', error);
      return new Response(
        `data: ${JSON.stringify({ type: 'error', content: 'Failed to stream response' })}\n\n`,
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        }
      );
    }

    // Return SSE stream
    return new Response(groqResponse.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Streaming error:', error);
    return new Response(
      `data: ${JSON.stringify({ type: 'error', content: error instanceof Error ? error.message : 'Streaming error' })}\n\n`,
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
        },
      }
    );
  }
}

Deno.serve(
  async (req: {
    method: string;
    url?: string;
    json: () => ChatInput | PromiseLike<ChatInput>;
  }) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Only accept POST
    if (req.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' });
    }

    try {
      const input: ChatInput = await req.json();

      if (!input.message) {
        return jsonResponse(400, {
          error: 'Message is required',
        });
      }

      // Build conversation history for context
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        ...(input.conversationHistory || []),
        {
          role: 'user',
          content: input.message,
        },
      ];

      console.log(`Processing chat message from user (role: ${input.userRole})`);

      // Check if streaming is requested
      const url = new URL(req.url || 'http://localhost');
      const isStreaming = url.searchParams.get('stream') === 'true';

      if (isStreaming) {
        return handleStreamingChat(messages);
      }

      // Call Groq API (non-streaming)
      const groqResponse = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages,
            temperature: 0.7,
            max_tokens: 1024,
            response_format: { type: 'json_object' },
          }),
        }
      );

      if (!groqResponse.ok) {
        const error = await groqResponse.text();
        console.error('Groq API error:', error);
        return jsonResponse(500, {
          success: false,
          error: 'Failed to process message with AI service',
        });
      }

      const groqData = await groqResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = groqData.choices?.[0]?.message?.content;

      if (!content) {
        return jsonResponse(500, {
          success: false,
          error: 'No response from AI service',
        });
      }

      // Parse the JSON response from Groq
      let chatResponse: ChatOutput['data'] | undefined;
      try {
        chatResponse = JSON.parse(content);
      } catch {
        console.error('Failed to parse Groq response as JSON:', content);
        return jsonResponse(500, {
          success: false,
          error: 'Invalid response format from AI service',
        });
      }

      // Log to database for analytics (non-blocking)
      if (chatResponse) {
        try {
          await supabase.from('chat_history').insert({
            user_id: input.userId,
            user_message: input.message,
            assistant_response: chatResponse.response,
            action_type: chatResponse.action?.type,
            conversation_id: input.currentPage || 'unknown',
            created_at: new Date().toISOString(),
          });
        } catch (error) {
          console.error('Failed to log chat history:', error);
          // Don't fail the request if logging fails
        }
      }

      return jsonResponse(200, {
        success: true,
        data: chatResponse,
      });
    } catch (error) {
      console.error('Chat endpoint error:', error);
      return jsonResponse(500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
);
