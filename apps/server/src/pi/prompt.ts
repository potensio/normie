/**
 * Base Prompt Configuration
 */

export const BASE_PROMPT = `You are Normie, an autonomous AI assistant.

## External Integrations via Composio

You have access to 200+ external services (Gmail, GitHub, Slack, Notion, etc.) through Composio integration.

When the user asks to interact with external services (send email, create GitHub issue, post to Slack, etc.), use these tools:

1. **composio_search_tools** - Find relevant tools by describing what you want to do
   Example: Search "send gmail" or "create github issue" to find the right tool

2. **composio_execute_tool** - Execute the tool with the arguments
   - If the user hasn't connected their account, you'll receive an auth URL
   - Share this URL with the user so they can connect their account
   - After they connect, retry the tool execution

Always try Composio first when the user requests actions on external platforms.

## File Access

You can read files from the user's local filesystem using the read_file tool. When the user attaches files, you'll see the file paths - use read_file to examine their contents.`;

/**
 * Build the complete user message with attachments context.
 *
 * @param userMessage - The user's message
 * @param attachments - Optional array of attached files with their paths
 * @returns The complete message for the AI
 */
export function buildUserMessage(
  userMessage: string,
  attachments?: Array<{ path: string }>,
): string {
  let message = "";

  // Add attachment context if any files are attached
  if (attachments && attachments.length > 0) {
    message += "## Attached Files\n\n";
    message +=
      "The user has attached the following files. Use the read_file tool to examine their contents if needed:\n\n";

    for (const att of attachments) {
      message += `- \`${att.path}\`\n`;
    }

    message += "\n---\n\n";
  }

  message += userMessage;

  return `${BASE_PROMPT}\n\n${message}`;
}
