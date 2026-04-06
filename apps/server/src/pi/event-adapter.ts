/**
 * Event Adapter for translating Pi Agent events to Normie's StreamChunk SSE format.
 *
 * This module acts as a bridge between Pi's unified event system and the existing
 * SSE streaming interface used by the frontend. It ensures frontend compatibility
 * without requiring changes to the client code.
 */

import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { StreamChunk } from '@normie/types';
import type { ToolCall } from '@mariozechner/pi-ai';

/**
 * Configuration for the EventAdapter.
 */
export interface EventAdapterConfig {
  /** Provider name (e.g., 'anthropic', 'openai', 'kimi-coding') */
  provider: string;
  /** Chat session identifier */
  chatId: string;
  /** Optional session ID for session_init event */
  sessionId?: string;
}

/**
 * Context stored for active tool calls to match results.
 */
interface ToolCallContext {
  name: string;
  input: Record<string, unknown>;
}

/**
 * Translates Pi Agent events to Normie's StreamChunk SSE format.
 *
 * The EventAdapter maintains compatibility with the existing frontend SSE format
 * while receiving events from the unified Pi Agent event system.
 *
 * @example
 * ```typescript
 * const adapter = new EventAdapter({
 *   provider: 'anthropic',
 *   chatId: 'chat-123',
 *   sessionId: 'session-abc'
 * });
 *
 * // In Pi Agent subscribe callback
 * session.subscribe((event) => {
 *   const chunk = adapter.translate(event);
 *   if (chunk) {
 *     res.write(`data: ${JSON.stringify(chunk)}\n\n`);
 *   }
 * });
 * ```
 */
export class EventAdapter {
  private config: EventAdapterConfig;
  /** Tracks active tool calls for result matching */
  private currentToolCalls: Map<string, ToolCallContext> = new Map();

  constructor(config: EventAdapterConfig) {
    this.config = config;
  }

  /**
   * Translate a Pi Agent event to a StreamChunk.
   *
   * Returns null for events that don't map to the SSE format
   * (e.g., turn_start, message_start, thinking events).
   *
   * @param event - Pi Agent event to translate
   * @returns StreamChunk for SSE emission, or null if not applicable
   */
  translate(event: AgentEvent): StreamChunk | null {
    switch (event.type) {
      case 'agent_start':
        return this.handleAgentStart();

      case 'message_update':
        return this.handleMessageUpdate(event);

      case 'tool_execution_start':
        return this.handleToolExecutionStart(event);

      case 'tool_execution_end':
        return this.handleToolExecutionEnd(event);

      case 'agent_end':
        return this.handleAgentEnd();

      // Events that don't map to StreamChunk format
      case 'turn_start':
      case 'turn_end':
      case 'message_start':
      case 'message_end':
      case 'tool_execution_update':
        return null;

      default:
        // Unknown event type - log warning but don't break flow
        console.warn(
          `[EventAdapter] Unknown event type: ${(event as { type: string }).type}`
        );
        return null;
    }
  }

  /**
   * Translate an error to a StreamChunk.
   *
   * @param error - Error to translate
   * @returns Error StreamChunk
   */
  translateError(error: Error): StreamChunk {
    return {
      type: 'error',
      message: error.message,
      provider: this.config.provider,
    };
  }

  /**
   * Translate an abort to a StreamChunk.
   *
   * @returns Aborted StreamChunk
   */
  translateAbort(): StreamChunk {
    return {
      type: 'aborted',
      provider: this.config.provider,
    };
  }

  /**
   * Handle agent_start event.
   * Emits session_init if we have a session ID, otherwise connected.
   */
  private handleAgentStart(): StreamChunk {
    if (this.config.sessionId) {
      return {
        type: 'session_init',
        session_id: this.config.sessionId,
        provider: this.config.provider,
      };
    }
    return {
      type: 'connected',
      message: 'Processing request...',
    };
  }

  /**
   * Handle message_update event.
   * Extracts text deltas and tool call starts from the nested event.
   */
  private handleMessageUpdate(
    event: Extract<AgentEvent, { type: 'message_update' }>
  ): StreamChunk | null {
    const messageEvent = event.assistantMessageEvent;

    switch (messageEvent.type) {
      case 'text_delta':
        return {
          type: 'text',
          content: messageEvent.delta,
          provider: this.config.provider,
        };

      case 'thinking_delta':
        // Thinking content - include isReasoning flag for frontend
        return {
          type: 'text',
          content: messageEvent.delta,
          provider: this.config.provider,
          isReasoning: true,
        };

      case 'toolcall_start': {
        // Tool call started - extract from partial message content
        const partial = messageEvent.partial;
        const content = partial.content;

        // Find the tool call from partial content
        for (const block of content) {
          if (block.type === 'toolCall') {
            const toolCall = block as ToolCall;
            // Store for result matching
            this.currentToolCalls.set(toolCall.id, {
              name: toolCall.name,
              input: toolCall.arguments,
            });

            return {
              type: 'tool_use',
              name: toolCall.name,
              input: toolCall.arguments,
              id: toolCall.id,
              provider: this.config.provider,
            };
          }
        }
        return null;
      }

      // Events that don't need separate StreamChunk emission
      case 'start':
      case 'text_start':
      case 'text_end':
      case 'thinking_start':
      case 'thinking_end':
      case 'toolcall_delta':
      case 'toolcall_end':
      case 'done':
      case 'error':
        return null;

      default:
        return null;
    }
  }

  /**
   * Handle tool_execution_start event.
   * This is emitted when tool execution begins (after toolcall_start).
   * We've already emitted tool_use in toolcall_start, so this is just for tracking.
   */
  private handleToolExecutionStart(
    event: Extract<AgentEvent, { type: 'tool_execution_start' }>
  ): StreamChunk | null {
    // Log tool execution start for debugging
    const toolContext = this.currentToolCalls.get(event.toolCallId);
    console.log('='.repeat(60));
    console.log(`[Tool:EXECUTE] Tool name: ${toolContext?.name || 'unknown'}`);
    console.log(`[Tool:EXECUTE] Tool call ID: ${event.toolCallId}`);
    console.log(`[Tool:EXECUTE] Input:`, JSON.stringify(toolContext?.input, null, 2));
    console.log('='.repeat(60));
    return null;
  }

  /**
   * Handle tool_execution_end event.
   * Emits tool result with proper error handling.
   */
  private handleToolExecutionEnd(
    event: Extract<AgentEvent, { type: 'tool_execution_end' }>
  ): StreamChunk {
    const { toolCallId, result, isError } = event;

    // Log tool execution result for debugging
    const toolContext = this.currentToolCalls.get(toolCallId);
    console.log('='.repeat(60));
    console.log(`[Tool:RESULT] Tool name: ${toolContext?.name || 'unknown'}`);
    console.log(`[Tool:RESULT] Success: ${!isError}`);
    if (isError) {
      console.log(`[Tool:RESULT] Error:`, typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    } else {
      const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      console.log(`[Tool:RESULT] Result (first 500 chars):`, resultStr?.substring(0, 500));
    }
    console.log('='.repeat(60));

    // Format result for frontend
    let formattedResult: unknown;
    if (isError) {
      formattedResult = {
        error: true,
        message:
          typeof result === 'string'
            ? result
            : result?.message || 'Tool execution failed',
        details: result,
      };
    } else {
      formattedResult = result;
    }

    // Clean up tracking
    this.currentToolCalls.delete(toolCallId);

    return {
      type: 'tool_result',
      result: formattedResult,
      tool_use_id: toolCallId,
      provider: this.config.provider,
    };
  }

  /**
   * Handle agent_end event.
   * Signals completion to the frontend and cleans up internal state.
   */
  private handleAgentEnd(): StreamChunk {
    // Clear any remaining tool call tracking
    this.currentToolCalls.clear();

    return {
      type: 'done',
      provider: this.config.provider,
    };
  }

  /**
   * Get the current provider name.
   */
  get provider(): string {
    return this.config.provider;
  }

  /**
   * Get the current chat ID.
   */
  get chatId(): string {
    return this.config.chatId;
  }

  /**
   * Get the current session ID.
   */
  get sessionId(): string | undefined {
    return this.config.sessionId;
  }

  /**
   * Update the session ID (useful when a new session is created).
   */
  setSessionId(sessionId: string): void {
    this.config = { ...this.config, sessionId };
  }
}
