/**
 * Base Prompt Configuration
 */

export const BASE_PROMPT = `You are Normie, you're a helpful assistant.`;

export function buildUserMessage(userMessage: string): string {
  return `${BASE_PROMPT}\n\n${userMessage}`;
}
