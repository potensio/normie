/**
 * Base provider interface for AI agent providers.
 * All providers must implement these methods.
 */

import type { StreamChunk } from '@normie/types';

/**
 * Parameters for provider query method
 */
export interface QueryParams {
  /** The current user message */
  prompt: string;
  /** Conversation history with current message */
  messages: Array<{ role: string; content: string }>;
  /** System prompt from workspace context */
  systemPrompt?: string;
  /** Chat session identifier */
  chatId: string;
  /** Existing session ID from DB (for resumption) */
  sessionId?: string;
  /** User identifier */
  userId: string;
  /** MCP server configurations */
  mcpServers?: Record<string, unknown>;
  /** List of allowed tool names */
  allowedTools?: string[];
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Model to use */
  model?: string;
}

/**
 * Provider configuration object
 */
export interface ProviderConfig {
  [key: string]: unknown;
}

/**
 * Message format for conversation history
 */
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Base provider abstract class for AI agent providers.
 * All providers must extend this class and implement the abstract methods.
 */
export abstract class BaseProvider {
  protected config: ProviderConfig;
  protected sessions: Map<string, string>;

  constructor(config: ProviderConfig = {}) {
    this.config = config;
    this.sessions = new Map();
  }

  /**
   * Get the provider name
   */
  abstract get name(): string;

  /**
   * Initialize the provider
   */
  abstract initialize(): Promise<void>;

  /**
   * Execute a query/prompt and yield streaming responses
   * @param params - Query parameters
   * @yields Streaming response chunks
   */
  abstract query(params: QueryParams): AsyncGenerator<StreamChunk>;

  /**
   * Build a prompt string from messages array (for providers that don't support native history)
   * @param messages - Conversation history
   * @param systemPrompt - Optional system prompt
   * @returns Formatted prompt string
   */
  protected buildPromptFromHistory(
    messages: HistoryMessage[],
    systemPrompt?: string | null
  ): string {
    const parts: string[] = [];

    if (systemPrompt) {
      parts.push(systemPrompt);
      parts.push('---');
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        parts.push(`User: ${msg.content}`);
      } else if (msg.role === 'assistant') {
        parts.push(`Assistant: ${msg.content}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Get or create a session for a chat
   * @param chatId - Chat identifier
   * @returns Session ID if exists, null otherwise
   */
  getSession(chatId: string): string | null {
    return this.sessions.get(chatId) || null;
  }

  /**
   * Store a session ID for a chat
   * @param chatId - Chat identifier
   * @param sessionId - Session identifier to store
   */
  setSession(chatId: string, sessionId: string): void {
    this.sessions.set(chatId, sessionId);
  }

  /**
   * Abort an active query for a given chatId
   * @param chatId - Chat identifier
   * @returns True if aborted, false if no active query
   */
  abort(_chatId: string): boolean {
    // Override in subclass to implement abort functionality
    return false;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.sessions.clear();
  }
}
