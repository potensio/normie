import { query } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider, type QueryParams } from './base-provider.js';
import type { StreamChunk } from '@normie/types';

/**
 * Claude Agent SDK provider implementation
 * Matches the exact behavior from server.js
 */
export class ClaudeProvider extends BaseProvider {
  private defaultAllowedTools: string[];
  private defaultMaxTurns: number;
  private permissionMode: string;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: Record<string, unknown> = {}) {
    super(config);
    // Default allowed tools - matches server.js
    this.defaultAllowedTools = (config.allowedTools as string[]) || [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
      'WebSearch', 'WebFetch', 'TodoWrite', 'Skill'
    ];
    this.defaultMaxTurns = (config.maxTurns as number) || 20;
    this.permissionMode = (config.permissionMode as string) || 'bypassPermissions';
  }

  get name(): string {
    return 'claude';
  }

  /**
   * Abort an active query for a given chatId
   */
  override abort(chatId: string): boolean {
    const controller = this.abortControllers.get(chatId);
    if (controller) {
      console.log('[Claude] Aborting query for chatId:', chatId);
      controller.abort();
      this.abortControllers.delete(chatId);
      return true;
    }
    return false;
  }

  /**
   * Initialize the provider (no-op for Claude)
   */
  async initialize(): Promise<void> {
    // No initialization needed for Claude SDK
  }

  /**
   * Execute a query using Claude Agent SDK
   * Matches the exact streaming logic from server.js
   */
  async *query(params: QueryParams): AsyncGenerator<StreamChunk> {
    const {
      prompt,
      messages,
      systemPrompt,
      chatId,
      sessionId: dbSessionId,  // Session ID from database
      mcpServers = {},
      allowedTools = this.defaultAllowedTools,
      maxTurns = this.defaultMaxTurns
    } = params;

    // Build query options - exact match to server.js structure
    // Using any to bypass SDK type constraints since the SDK expects specific types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryOptions: any = {
      allowedTools,
      maxTurns,
      mcpServers,
      permissionMode: this.permissionMode,
      settingSources: ['user', 'project']  // Enable Skills from filesystem
    };

    // Check for existing session - prefer DB session over in-memory
    const existingSessionId = dbSessionId || (chatId ? this.getSession(chatId) : null);
    console.log('[Claude] Session for', chatId, ':', existingSessionId || 'none (new chat)');

    // If we have an existing session, resume it
    if (existingSessionId) {
      queryOptions.resume = existingSessionId;
      console.log('[Claude] Resuming session:', existingSessionId);
    }

    // Build the full prompt from conversation history
    // This enables project-level memory that persists across providers
    let fullPrompt: string;
    
    if (messages && messages.length > 0) {
      // Use conversation history
      fullPrompt = this.buildPromptFromHistory(
        messages as Array<{ role: 'user' | 'assistant'; content: string }>, 
        systemPrompt
      );
      console.log('[Claude] Using conversation history, messages:', messages.length);
    } else if (systemPrompt) {
      // Just system prompt + current message
      fullPrompt = `${systemPrompt}\n\n---\n\nUser: ${prompt}`;
    } else {
      // Just the current message
      fullPrompt = prompt;
    }

    console.log('[Claude] Prompt length:', fullPrompt.length);
    console.log('[Claude] Calling Claude Agent SDK...');

    // Create abort controller for this request
    const abortController = new AbortController();
    if (chatId) {
      this.abortControllers.set(chatId, abortController);
    }

    try {
      // Stream responses from Claude Agent SDK - matches server.js exactly
      // Using any to bypass SDK type constraints
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const chunk of query({
        prompt: fullPrompt,
        options: queryOptions
      }) as any) {
        // Debug: log all system messages to find session_id
        if (chunk.type === 'system') {
          console.log('[Claude] System message:', JSON.stringify(chunk, null, 2));
        }

        // Capture session ID from system init message - matches server.js logic
        if (chunk.type === 'system') {
          const subtype = chunk.subtype;
          
          if (subtype === 'init') {
            const newSessionId = chunk.session_id || chunk.data?.session_id || chunk.sessionId;
            if (newSessionId && chatId) {
              this.setSession(chatId, newSessionId);
              console.log('[Claude] Session ID captured:', newSessionId);
              console.log('[Claude] Total sessions stored:', this.sessions.size);
            } else {
              console.log('[Claude] No session_id found in init message');
            }

            // Yield session init event
            if (newSessionId) {
              yield {
                type: 'session_init',
                session_id: newSessionId,
                provider: this.name
              };
            }
            continue;
          }
        }

        // Handle assistant messages - extract text and tool_use blocks
        if (chunk.type === 'assistant' && chunk.message && chunk.message.content) {
          const content = chunk.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                yield {
                  type: 'text',
                  content: block.text,
                  provider: this.name
                };
              } else if (block.type === 'tool_use') {
                yield {
                  type: 'tool_use',
                  name: block.name,
                  input: block.input as Record<string, unknown>,
                  id: block.id,
                  provider: this.name
                };
                console.log('[Claude] Tool use:', block.name);
              }
            }
          }
          continue;
        }

        // Handle result type (tool results or other results)
        if (chunk.type === 'result') {
          yield {
            type: 'tool_result',
            result: chunk.result || chunk.content || chunk,
            tool_use_id: chunk.tool_use_id,
            provider: this.name
          };
          continue;
        }

        // Skip system chunks, pass through others (only known types)
        if (chunk.type !== 'system') {
          const chunkType = chunk.type;
          if (['session_init', 'text', 'tool_use', 'tool_result', 'done', 'error', 'aborted'].includes(chunkType)) {
            yield {
              ...chunk,
              provider: this.name
            } as StreamChunk;
          }
        }
      }

      // Signal completion
      yield {
        type: 'done',
        provider: this.name
      };

      console.log('[Claude] Stream completed');
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('[Claude] Query aborted for chatId:', chatId);
        yield {
          type: 'aborted',
          provider: this.name
        };
      } else {
        throw error;
      }
    } finally {
      // Clean up abort controller
      if (chatId) {
        this.abortControllers.delete(chatId);
      }
    }
  }
}
