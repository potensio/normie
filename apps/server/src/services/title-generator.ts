/**
 * Title Generator Service
 *
 * Generates concise conversation titles using Bedrock Mantle (OpenAI-compatible API).
 * Uses GLM-5 for fast, cheap title generation.
 */

interface TitleGenerationParams {
  userMessage: string;
  assistantResponse: string;
}

/**
 * Generates a conversation title based on the first user message and assistant response.
 * Uses Bedrock Mantle (OpenAI-compatible) for generation.
 */
export async function generateConversationTitle(
  params: TitleGenerationParams
): Promise<string> {
  const { userMessage, assistantResponse } = params;

  // Check Bedrock Mantle configuration
  const apiKey = process.env.BEDROCK_API_KEY;
  const baseUrl = process.env.BEDROCK_BASE_URL;

  if (!apiKey || !baseUrl) {
    console.log('[TitleGenerator] Bedrock Mantle not configured, using fallback');
    return fallbackTitle(userMessage);
  }

  try {
    console.log('[TitleGenerator] Generating title with Bedrock Mantle...');

    // Build the title generation prompt
    const prompt = buildTitlePrompt(userMessage, assistantResponse);

    // Call Bedrock Mantle API (simple fetch, no streaming needed)
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'zai.glm-5',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 50,
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error(`[TitleGenerator] API error: ${response.status}`);
      return fallbackTitle(userMessage);
    }

    const data = await response.json();
    const rawTitle = data.choices?.[0]?.message?.content || '';

    // Clean up the title
    const title = cleanTitle(rawTitle);

    if (title && title.length > 0 && title.length <= 100) {
      console.log('[TitleGenerator] Generated title:', title);
      return title;
    }

    console.log('[TitleGenerator] Invalid title, using fallback');
    return fallbackTitle(userMessage);
  } catch (error) {
    console.error('[TitleGenerator] Error:', error);
    return fallbackTitle(userMessage);
  }
}

/**
 * Build the prompt for title generation.
 */
function buildTitlePrompt(userMessage: string, assistantResponse: string): string {
  // Truncate long messages for the prompt
  const truncatedUser = userMessage.length > 300
    ? userMessage.substring(0, 300) + '...'
    : userMessage;
  const truncatedAssistant = assistantResponse.length > 300
    ? assistantResponse.substring(0, 300) + '...'
    : assistantResponse;

  return `Generate a short 3-6 word title for this conversation. Respond with ONLY the title, no quotes, no punctuation.

User: ${truncatedUser}

Assistant: ${truncatedAssistant}

Title:`;
}

/**
 * Clean up the generated title.
 */
function cleanTitle(title: string): string {
  // Remove quotes if present
  let cleaned = title.replace(/^["'""]+|["'""]+$/g, '');

  // Remove "Title:" prefix if present
  cleaned = cleaned.replace(/^Title:\s*/i, '');

  // Remove trailing punctuation
  cleaned = cleaned.replace(/[.!?,;:]+$/, '');

  // Remove newlines and extra spaces
  cleaned = cleaned.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Fallback title when AI generation fails:
 * First 30 chars of user message with ellipsis if truncated
 */
function fallbackTitle(userMessage: string): string {
  const trimmed = userMessage.trim();
  if (trimmed.length <= 30) {
    return trimmed;
  }
  return trimmed.substring(0, 27) + '...';
}