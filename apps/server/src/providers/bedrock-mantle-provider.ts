/**
 * Bedrock Mantle Provider
 * 
 * OpenAI-compatible API client for AWS Bedrock Mantle.
 * Provides access to models like GLM-5, Kimi K2.5, GPT OSS via
 * the Bedrock Mantle API (OpenAI-compatible).
 * 
 * Now supports function calling (tools).
 * 
 * @see BEDROCK_MANTLE_PLAN.md for details
 */

import type { StreamChunk } from '@normie/types';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';

/**
 * Bedrock Mantle API configuration
 */
export interface BedrockMantleConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  tools?: AgentTool[];
  contextWindow?: number;
}

/**
 * Default context window for Mantle models (128k tokens)
 */
const DEFAULT_CONTEXT_WINDOW = 128000;

/**
 * Tokens to reserve for the response
 */
const RESERVE_TOKENS = 8000;

/**
 * Estimate tokens in ChatMessage array
 */
function estimateMessagesTokens(messages: ChatMessage[]): number {
  // Simple token estimation: ~4 characters per token
  // This is a rough approximation but good enough for context management
  let totalChars = 0;
  for (const m of messages) {
    if (m.content) totalChars += m.content.length;
    if (m.tool_calls) {
      totalChars += JSON.stringify(m.tool_calls).length;
    }
    if (m.name) totalChars += m.name.length;
    totalChars += 20; // Role and metadata overhead
  }
  return Math.ceil(totalChars / 4);
}

/**
 * Context management result
 */
interface ContextCheckResult {
  messages: ChatMessage[];
  wasCompacted: boolean;
  estimatedTokens: number;
  percentUsed: number;
}

/**
 * Check context size and truncate old messages if needed.
 * Keeps system message + recent messages within budget.
 */
function checkAndTruncateContext(
  messages: ChatMessage[],
  contextWindow: number,
): ContextCheckResult {
  const systemMessage = messages.find(m => m.role === 'system');
  const nonSystemMessages = messages.filter(m => m.role !== 'system');
  
  // Calculate current token usage
  const totalTokens = estimateMessagesTokens(messages);
  const percentUsed = (totalTokens / contextWindow) * 100;
  
  // Log warning if approaching limit
  if (percentUsed > 70) {
    console.log(`[Mantle:Context] ⚠️ Context usage: ${Math.round(percentUsed)}% (${totalTokens}/${contextWindow} tokens)`);
  }
  
  // If we're within budget, return as-is
  const budget = contextWindow - RESERVE_TOKENS;
  if (totalTokens <= budget) {
    return {
      messages,
      wasCompacted: false,
      estimatedTokens: totalTokens,
      percentUsed,
    };
  }
  
  // Need to truncate - keep system message + as many recent messages as fit
  console.log(`[Mantle:Context] 🔧 Compacting context: ${totalTokens} > ${budget} tokens`);
  
  // Start with system message
  const truncated: ChatMessage[] = systemMessage ? [systemMessage] : [];
  let currentTokens = systemMessage ? estimateMessagesTokens([systemMessage]) : 0;
  
  // Add messages from newest to oldest until budget exhausted
  const reversedNonSystem = [...nonSystemMessages].reverse();
  const kept: ChatMessage[] = [];
  
  for (const msg of reversedNonSystem) {
    const msgTokens = estimateMessagesTokens([msg]);
    if (currentTokens + msgTokens <= budget) {
      kept.unshift(msg); // Add to front to preserve order
      currentTokens += msgTokens;
    } else {
      // Budget exhausted, stop adding
      break;
    }
  }
  
  truncated.push(...kept);
  
  const newTokens = estimateMessagesTokens(truncated);
  const removedCount = messages.length - truncated.length;
  
  console.log(`[Mantle:Context] Removed ${removedCount} old messages, new usage: ${newTokens} tokens`);
  
  return {
    messages: truncated,
    wasCompacted: true,
    estimatedTokens: newTokens,
    percentUsed: (newTokens / contextWindow) * 100,
  };
}

/**
 * Message format for Mantle API (OpenAI-compatible)
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * Tool call from API response
 */
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Tool definition in OpenAI format
 */
interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Convert Pi AgentTool to OpenAI tool definition format
 */
function convertToolToOpenAIFormat(tool: AgentTool): ToolDefinition {
  // Extract parameters from TypeBox schema
  const parameters = tool.parameters?.properties 
    ? JSON.parse(JSON.stringify(tool.parameters))
    : { type: 'object', properties: {}, required: [] };

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || `Execute ${tool.name}`,
      parameters,
    },
  };
}

/**
 * Execute a tool call and return the result
 */
async function executeToolCall(
  tool: AgentTool,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<AgentToolResult<unknown>> {
  console.log(`[Mantle:Tool] Executing tool: ${tool.name}`);
  console.log(`[Mantle:Tool] Arguments:`, JSON.stringify(args, null, 2));

  try {
    const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const result = await tool.execute(toolCallId, args, signal);
    
    console.log(`[Mantle:Tool] Result success: ${!(result as any)?.error}`);
    
    return result;
  } catch (error) {
    console.error(`[Mantle:Tool] Execution error:`, error);
    return {
      content: [{
        type: 'text',
        text: `Error executing ${tool.name}: ${(error as Error).message}`,
      }],
      details: {
        error: true,
        message: (error as Error).message,
      },
    };
  }
}

/**
 * Format tool result for API
 */
function formatToolResultAsString(result: AgentToolResult<unknown>): string {
  if (result.content && Array.isArray(result.content)) {
    return result.content
      .map((c: any) => {
        if (c.type === 'text') return c.text;
        return JSON.stringify(c);
      })
      .join('\n');
  }
  return JSON.stringify(result);
}

/**
 * Main streaming function with tool support.
 * 
 * This function implements an agentic loop:
 * 1. Send messages to API with tool definitions
 * 2. If API returns tool_calls, execute them
 * 3. Send tool results back to API
 * 4. Repeat until API returns text response
 * 
 * @param config - API configuration including tools
 * @param messages - Chat messages
 * @param signal - Abort signal
 */
export async function* streamBedrockMantle(
  config: BedrockMantleConfig,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const { 
    apiKey, 
    baseUrl, 
    model, 
    maxTokens = 4096, 
    temperature = 0.7, 
    tools = [],
    contextWindow = DEFAULT_CONTEXT_WINDOW,
  } = config;

  console.log('[BedrockMantle] Starting stream...');
  console.log(`[BedrockMantle] Model: ${model}`);
  console.log(`[BedrockMantle] Base URL: ${baseUrl}`);
  console.log(`[BedrockMantle] Tools available: ${tools.length}`);
  console.log(`[BedrockMantle] Context window: ${contextWindow} tokens`);

  // Build tool definitions for API
  const toolDefinitions = tools.length > 0 
    ? tools.map(convertToolToOpenAIFormat)
    : undefined;

  // Create tool lookup map
  const toolMap = new Map<string, AgentTool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Yield connected event
  yield {
    type: 'connected',
    message: 'Connecting to Bedrock Mantle...',
  };

  // Track conversation for multi-turn tool usage
  let conversationMessages: ChatMessage[] = [...messages];
  
  // Initial context check
  const initialContext = checkAndTruncateContext(conversationMessages, contextWindow);
  conversationMessages = initialContext.messages;
  console.log(`[BedrockMantle] Initial context: ${initialContext.estimatedTokens} tokens (${Math.round(initialContext.percentUsed)}%)`);
  
  // Limit iterations to prevent infinite loops
  const maxIterations = 10;
  let iteration = 0;

  try {
    while (iteration < maxIterations) {
      iteration++;
      console.log(`[BedrockMantle] Iteration ${iteration}/${maxIterations}`);
      
      // Check context size before each API call
      const contextCheck = checkAndTruncateContext(conversationMessages, contextWindow);
      if (contextCheck.wasCompacted) {
        conversationMessages = contextCheck.messages;
      }

      // Make request to API
      const requestBody: Record<string, unknown> = {
        model,
        messages: conversationMessages,
        max_tokens: maxTokens,
        temperature,
        stream: true,
      };

      // Add tools if available
      if (toolDefinitions) {
        requestBody.tools = toolDefinitions;
        requestBody.tool_choice = 'auto';
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[BedrockMantle] API error: ${response.status} ${response.statusText}`);
        console.error(`[BedrockMantle] Error body: ${errorText}`);
        
        yield {
          type: 'error',
          message: `Bedrock Mantle API error: ${response.status} ${response.statusText}`,
          provider: 'bedrock-mantle',
        };
        return;
      }

      if (!response.body) {
        yield {
          type: 'error',
          message: 'No response body from Bedrock Mantle',
          provider: 'bedrock-mantle',
        };
        return;
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sessionId: string = 'mantle-' + Date.now();
      
      // Collect response content and tool calls
      let responseContent = '';
      let toolCalls: ToolCall[] = [];
      let finishReason: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('[BedrockMantle] Stream chunk complete');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              
              // Extract session/chat ID from first chunk
              if (!sessionId && parsed.id) {
                sessionId = parsed.id;
                yield {
                  type: 'session_init',
                  session_id: sessionId,
                  provider: 'bedrock-mantle',
                };
              }

              // Extract delta
              const delta = parsed.choices?.[0]?.delta;
              const currentFinishReason = parsed.choices?.[0]?.finish_reason;

              // Handle text content
              if (delta?.content) {
                responseContent += delta.content;
                yield {
                  type: 'text',
                  content: delta.content,
                  provider: 'bedrock-mantle',
                };
              }

              // Handle tool calls (streaming)
              if (delta?.tool_calls) {
                for (const toolCallDelta of delta.tool_calls) {
                  const index = toolCallDelta.index;
                  
                  // Initialize tool call slot if needed
                  if (!toolCalls[index]) {
                    toolCalls[index] = {
                      id: toolCallDelta.id || '',
                      type: 'function',
                      function: {
                        name: '',
                        arguments: '',
                      },
                    };
                  }

                  // Update tool call with delta data
                  if (toolCallDelta.id) {
                    toolCalls[index].id = toolCallDelta.id;
                  }
                  if (toolCallDelta.function?.name) {
                    toolCalls[index].function.name = toolCallDelta.function.name;
                  }
                  if (toolCallDelta.function?.arguments) {
                    toolCalls[index].function.arguments += toolCallDelta.function.arguments;
                  }
                }
              }

              // Capture finish reason
              if (currentFinishReason) {
                finishReason = currentFinishReason;
              }

            } catch (parseError) {
              // Skip unparseable lines
              continue;
            }
          }
        }
      }

      // Check finish reason
      if (finishReason === 'tool_calls' && toolCalls.length > 0) {
        console.log(`[BedrockMantle] Model requested ${toolCalls.length} tool calls`);
        
        // Add assistant message with tool calls to conversation
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: responseContent || null,
          tool_calls: toolCalls,
        };
        conversationMessages.push(assistantMessage);

        // Execute each tool call
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          const tool = toolMap.get(toolName);

          if (!tool) {
            console.error(`[Mantle:Tool] Unknown tool: ${toolName}`);
            continue;
          }

          // Emit tool_use event
          yield {
            type: 'tool_use',
            name: toolName,
            input: toolArgs,
            id: toolCall.id,
            provider: 'bedrock-mantle',
          };

          // Execute the tool
          const result = await executeToolCall(tool, toolArgs, signal);

          // Format result
          const resultString = formatToolResultAsString(result);

          // Emit tool_result event
          yield {
            type: 'tool_result',
            result: result,
            tool_use_id: toolCall.id,
            provider: 'bedrock-mantle',
          };

          // Add tool result to conversation
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: resultString,
          });
        }

        // Continue the loop - send tool results back to model
        console.log('[BedrockMantle] Sending tool results back to model...');
        continue;
      }

      // If we get here, the model finished with a regular response
      console.log('[BedrockMantle] Model finished generating');
      
      // Yield done event
      yield {
        type: 'done',
        provider: 'bedrock-mantle',
      };
      
      return;
    }

    // If we hit max iterations
    console.warn('[BedrockMantle] Max iterations reached');
    yield {
      type: 'error',
      message: 'Maximum tool call iterations reached',
      provider: 'bedrock-mantle',
    };

  } catch (error) {
    console.error('[BedrockMantle] Stream error:', error);
    
    // Check if aborted
    if ((error as Error).name === 'AbortError') {
      yield {
        type: 'aborted',
        provider: 'bedrock-mantle',
      };
    } else {
      yield {
        type: 'error',
        message: (error as Error).message,
        provider: 'bedrock-mantle',
      };
    }
  }
}

/**
 * Non-streaming request to Bedrock Mantle API.
 */
export async function completeBedrockMantle(
  config: BedrockMantleConfig,
  messages: ChatMessage[]
): Promise<string> {
  const { apiKey, baseUrl, model, maxTokens = 4096, temperature = 0.7 } = config;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Bedrock Mantle API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Available models on Bedrock Mantle
 */
export const BEDROCK_MANTLE_MODELS = [
  {
    id: 'zai.glm-5',
    name: 'GLM-5',
    description: 'Z.AI GLM-5 - Advanced reasoning model',
    contextWindow: 128000,
    maxTokens: 4096,
    reasoning: true,
  },
  {
    id: 'moonshotai.kimi-k2.5',
    name: 'Kimi K2.5',
    description: 'Moonshot AI Kimi K2.5 - General purpose',
    contextWindow: 128000,
    maxTokens: 4096,
    reasoning: false,
  },
  {
    id: 'openai.gpt-oss-120b',
    name: 'GPT OSS 120B',
    description: 'OpenAI GPT OSS 120B - Open source model',
    contextWindow: 128000,
    maxTokens: 4096,
    reasoning: false,
  },
];

/**
 * Check if a model is a Bedrock Mantle model
 */
export function isBedrockMantleModel(modelId: string): boolean {
  return BEDROCK_MANTLE_MODELS.some(m => m.id === modelId);
}

/**
 * Check if Bedrock Mantle is configured
 */
export function isBedrockMantleConfigured(): boolean {
  return !!(process.env.BEDROCK_API_KEY && process.env.BEDROCK_BASE_URL);
}

/**
 * Get Bedrock Mantle configuration from environment
 */
export function getBedrockMantleConfig(): BedrockMantleConfig | null {
  const apiKey = process.env.BEDROCK_API_KEY;
  const baseUrl = process.env.BEDROCK_BASE_URL;

  if (!apiKey || !baseUrl) {
    return null;
  }

  return {
    apiKey,
    baseUrl,
    model: 'zai.glm-5', // Default model
  };
}