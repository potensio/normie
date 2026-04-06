/**
 * Bedrock Mantle Provider
 * 
 * OpenAI-compatible API client for AWS Bedrock Mantle.
 * Provides access to models like GLM-5, Kimi K2.5, GPT OSS via
 * the Bedrock Mantle API (OpenAI-compatible).
 * 
 * @see BEDROCK_MANTLE_PLAN.md for details
 */

import type { StreamChunk } from '@normie/types';

/**
 * Bedrock Mantle API configuration
 */
export interface BedrockMantleConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Message format for Mantle API
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Streaming request to Bedrock Mantle API.
 * 
 * @param config - API configuration
 * @param messages - Chat messages
 * @param onChunk - Callback for each SSE chunk
 */
export async function* streamBedrockMantle(
  config: BedrockMantleConfig,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const { apiKey, baseUrl, model, maxTokens = 4096, temperature = 0.7 } = config;

  console.log('[BedrockMantle] Starting stream...');
  console.log(`[BedrockMantle] Model: ${model}`);
  console.log(`[BedrockMantle] Base URL: ${baseUrl}`);

  // Yield connected event
  yield {
    type: 'connected',
    message: 'Connecting to Bedrock Mantle...',
  };

  try {
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
        stream: true,
      }),
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

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        console.log('[BedrockMantle] Stream complete');
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

            // Extract content from delta
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              yield {
                type: 'text',
                content: delta.content,
                provider: 'bedrock-mantle',
              };
            }

            // Check for finish reason
            const finishReason = parsed.choices?.[0]?.finish_reason;
            if (finishReason === 'stop') {
              console.log('[BedrockMantle] Model finished generating');
            }

          } catch (parseError) {
            // Skip unparseable lines (可能是空行或注释)
            continue;
          }
        }
      }
    }

    // Yield done event
    yield {
      type: 'done',
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