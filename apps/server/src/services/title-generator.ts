/**
 * Title Generator Service
 *
 * Generates concise conversation titles using AI based on the first exchange.
 */
import { getProvider } from '../providers/index.js';
import type { Provider } from '@normie/types';

interface TitleGenerationParams {
  userMessage: string;
  assistantResponse: string;
  provider: Provider;
  model?: string;
}

/**
 * Generates a conversation title based on the first user message and assistant response.
 * Falls back to a truncated user message if generation fails.
 */
export async function generateConversationTitle(
  params: TitleGenerationParams
): Promise<string> {
  const { userMessage, assistantResponse, provider, model } = params;

  const providerInstance = getProvider(provider);

  // Truncate inputs to keep the prompt concise
  const truncatedUser = userMessage.substring(0, 500);
  const truncatedAssistant = assistantResponse.substring(0, 500);

  const prompt = `Generate a concise 3-6 word title for this conversation.

User: ${truncatedUser}
Assistant: ${truncatedAssistant}

Rules:
- 3-6 words only
- No quotes or punctuation
- Be descriptive but brief
- Just return the title, nothing else

Title:`;

  try {
    let title = '';

    // Use the provider to generate title
    for await (const chunk of providerInstance.query({
      prompt,
      messages: [{ role: 'user', content: prompt }],
      chatId: `title-gen-${Date.now()}`,
      userId: 'system', // Title generation is lightweight
      model: model ?? undefined,
      maxTurns: 1,
    })) {
      if (chunk.type === 'text' && chunk.content) {
        title += chunk.content;
      }
    }

    // Clean up the title
    title = cleanupTitle(title);

    return title || fallbackTitle(userMessage);
  } catch (error) {
    console.error('[TitleGenerator] Failed to generate title:', error);
    return fallbackTitle(userMessage);
  }
}

/**
 * Clean up a generated title:
 * - Remove surrounding quotes
 * - Remove newlines
 * - Trim whitespace
 * - Truncate if too long
 */
function cleanupTitle(title: string): string {
  let cleaned = title
    .trim()
    // Remove surrounding quotes (both single and double)
    .replace(/^[\'""'']|[\'""'']$/g, '')
    // Replace newlines and multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Remove common prefixes the AI might add
    .replace(/^(Title:|Conversation:|Topic:)\s*/i, '')
    .trim();

  // Ensure it's not too long
  if (cleaned.length > 60) {
    cleaned = cleaned.substring(0, 57) + '...';
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
