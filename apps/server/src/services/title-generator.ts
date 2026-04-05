/**
 * Title Generator Service
 *
 * Generates concise conversation titles using AI based on the first exchange.
 *
 * NOTE: Currently using fallback title generation until Pi Agent integration
 * is complete. The getProvider function has been deprecated.
 */

import type { Provider } from '@normie/types';

interface TitleGenerationParams {
  userMessage: string;
  assistantResponse: string;
  provider: Provider;
  model?: string;
}

/**
 * Generates a conversation title based on the first user message and assistant response.
 * Currently uses fallback generation until Pi Agent integration is complete.
 */
export async function generateConversationTitle(
  params: TitleGenerationParams
): Promise<string> {
  const { userMessage } = params;

  // TODO: Integrate with Pi Agent for AI-powered title generation
  // For now, use fallback title generation
  console.log('[TitleGenerator] Using fallback title (Pi Agent integration pending)');
  
  return fallbackTitle(userMessage);
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
