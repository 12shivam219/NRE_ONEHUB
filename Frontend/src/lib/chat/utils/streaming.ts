/**
 * Streaming utilities for token-by-token responses
 * Handles streaming from Groq API and frontend message updates
 */

export interface StreamMessage {
  type: 'token' | 'complete' | 'error';
  content: string;
  actionIntent?: string;
}

/**
 * Parse streaming response chunks from Groq API
 */
export async function* parseGroqStream(response: Response): AsyncGenerator<StreamMessage> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse complete JSON lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue;

        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.choices?.[0]?.delta?.content) {
              yield {
                type: 'token',
                content: data.choices[0].delta.content,
              };
            }

            if (data.choices?.[0]?.finish_reason === 'stop') {
              yield {
                type: 'complete',
                content: '',
              };
            }
          } catch (err) {
            console.error('Error parsing stream chunk:', err);
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim() && buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        if (data.choices?.[0]?.delta?.content) {
          yield {
            type: 'token',
            content: data.choices[0].delta.content,
          };
        }
      } catch (err) {
        console.error('Error parsing final stream chunk:', err);
      }
    }
  } catch (err) {
    yield {
      type: 'error',
      content: err instanceof Error ? err.message : 'Streaming error',
    };
  } finally {
    reader.releaseLock();
  }
}

/**
 * Extract action intent from complete response text
 */
export function extractActionIntent(text: string): {
  type: string;
  target?: string;
  params?: Record<string, unknown>;
} {
  // Look for [ACTION: type]target?params patterns in response
  const actionMatch = text.match(/\[ACTION:\s*(\w+)\s*\]([^?]*)?(\?.*)?/);
  
  if (!actionMatch) {
    return { type: 'none' };
  }

  const [, type, target, paramStr] = actionMatch;
  const action: { type: string; target?: string; params?: Record<string, unknown> } = { type };

  if (target?.trim()) {
    action.target = target.trim();
  }

  if (paramStr) {
    try {
      action.params = Object.fromEntries(
        new URLSearchParams(paramStr.slice(1)).entries()
      );
    } catch (err) {
      console.error('Error parsing action params:', err);
    }
  }

  return action;
}

/**
 * Format message for streaming display (removes action markers for user-visible text)
 */
export function formatStreamedMessage(text: string): string {
  return text
    .replace(/\[ACTION:\s*\w+\][^?]*(\?[^\s])*/g, '') // Remove action markers
    .trim();
}
