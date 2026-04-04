import { BaseProvider, type QueryParams, type ProviderConfig } from './base-provider.js';
import type { StreamChunk } from '@normie/types';
import { MCPClient } from './mcp-client.js';

/**
 * OpenAI-compatible tool format
 */
interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Tool call from API
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
 * Conversation message
 */
interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
}

/**
 * MCP server configuration
 */
interface MCPServerConfig {
  type?: string;
  url?: string;
  headers?: Record<string, string>;
}

/**
 * AWS Bedrock provider via Mantle API (OpenAI-compatible)
 * Supports Kimi K2.5 and GLM-5 models
 */
export class BedrockProvider extends BaseProvider {
  private apiKey: string | undefined;
  private baseUrl: string;
  private defaultModel: string;
  private defaultMaxTurns: number;
  private abortControllers: Map<string, AbortController> = new Map();
  private mcpClients: Map<string, MCPClient> = new Map();
  private historyStore: Map<string, ConversationMessage[]> = new Map();

  constructor(config: ProviderConfig = {}) {
    super(config);
    this.apiKey = (config.apiKey as string) || process.env.BEDROCK_API_KEY;
    this.baseUrl = (config.baseUrl as string) || 'https://bedrock-mantle.ap-southeast-3.api.aws/v1/chat/completions';
    this.defaultModel = (config.model as string) || 'zai.glm-5';
    this.defaultMaxTurns = (config.maxTurns as number) || 10;
  }

  get name(): string {
    return 'bedrock';
  }

  override abort(chatId: string): boolean {
    const controller = this.abortControllers.get(chatId);
    if (controller) {
      console.log('[Bedrock] Aborting query for chatId:', chatId);
      controller.abort();
      this.abortControllers.delete(chatId);
      return true;
    }
    return false;
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  private async getMCPTools(mcpServers: Record<string, MCPServerConfig>, _allowedTools: string[] | null): Promise<OpenAITool[]> {
    if (!mcpServers || Object.keys(mcpServers).length === 0) {
      return [];
    }

    const allTools: OpenAITool[] = [];

    for (const [serverName, config] of Object.entries(mcpServers)) {
      let mcpClient = this.mcpClients.get(serverName);
      
      if (!mcpClient) {
        mcpClient = new MCPClient();
        try {
          await mcpClient.connect(serverName, config as { url: string; headers?: Record<string, string> });
          this.mcpClients.set(serverName, mcpClient);
        } catch (error) {
          console.error(`[Bedrock] Failed to connect to MCP server ${serverName}:`, (error as Error).message);
          continue;
        }
      }

      try {
        const mcpTools = await mcpClient.listTools(serverName);
        const openaiTools = mcpClient.convertToolsToOpenAIFormat(mcpTools, serverName);
        allTools.push(...openaiTools);
      } catch (error) {
        console.error(`[Bedrock] Failed to get tools from ${serverName}:`, (error as Error).message);
      }
    }

    return allTools;
  }

  private async executeToolCall(
    toolCallId: string, 
    toolCallName: string, 
    toolCallArgs: Record<string, unknown>, 
    mcpServers: Record<string, MCPServerConfig>
  ): Promise<ConversationMessage> {
    const parsed = MCPClient.parseToolCall(toolCallName);
    
    if (!parsed) {
      return {
        tool_call_id: toolCallId,
        role: 'tool',
        content: `Error: Invalid tool call name format: ${toolCallName}`
      };
    }

    const { serverName, toolName } = parsed;
    const mcpClient = this.mcpClients.get(serverName);

    if (!mcpClient) {
      return {
        tool_call_id: toolCallId,
        role: 'tool',
        content: `Error: MCP server not connected: ${serverName}`
      };
    }

    try {
      console.log(`[Bedrock] Executing MCP tool: ${toolName} on ${serverName}`);
      const result = await mcpClient.callTool(serverName, toolName, toolCallArgs) as { 
        content?: Array<{ type: string; text?: string; mimeType?: string }>;
      };
      
      let content: string;
      if (result.content) {
        content = result.content.map(c => {
          if (c.type === 'text') return c.text || '';
          if (c.type === 'image') return `[Image: ${c.mimeType}]`;
          return JSON.stringify(c);
        }).join('\n');
      } else {
        content = JSON.stringify(result);
      }

      console.log(`[Bedrock] Tool result:`, content.substring(0, 200));
      
      return {
        tool_call_id: toolCallId,
        role: 'tool',
        content
      };
    } catch (error) {
      console.error(`[Bedrock] Tool execution error:`, (error as Error).message);
      return {
        tool_call_id: toolCallId,
        role: 'tool',
        content: `Error: ${(error as Error).message}`
      };
    }
  }

  private getHistory(sessionId: string): ConversationMessage[] {
    return this.historyStore.get(sessionId) || [];
  }

  private setHistory(sessionId: string, role: 'user' | 'assistant', content: string): void {
    const history = this.historyStore.get(sessionId) || [];
    history.push({ role, content });
    this.historyStore.set(sessionId, history);
  }

  async *query(params: QueryParams): AsyncGenerator<StreamChunk> {
    const {
      prompt,
      messages,
      systemPrompt,
      chatId,
      sessionId: dbSessionId,
      model,
      mcpServers = {},
      allowedTools = null,
      maxTurns = this.defaultMaxTurns
    } = params;

    const modelToUse = model || this.defaultModel;

    if (!this.apiKey) {
      yield { type: 'error', message: 'BEDROCK_API_KEY not set', provider: this.name };
      return;
    }

    // Yield session_init for consistency
    const effectiveSessionId = dbSessionId || chatId;
    if (effectiveSessionId) {
      yield {
        type: 'session_init',
        session_id: effectiveSessionId,
        provider: this.name
      };
    }

    // Build messages array
    const conversationMessages: ConversationMessage[] = [];
    
    if (systemPrompt) {
      conversationMessages.push({ role: 'system', content: systemPrompt });
    }
    
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        conversationMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        });
      }
    } else {
      const sessionId = dbSessionId || (chatId ? this.getSession(chatId) : null);
      const sessionHistory = sessionId ? this.getHistory(sessionId) : [];
      conversationMessages.push(...sessionHistory);
      conversationMessages.push({ role: 'user', content: prompt });
    }
    
    console.log('[Bedrock] Using', conversationMessages.length, 'messages from', messages ? 'project memory' : 'session history');

    const abortController = new AbortController();
    if (chatId) {
      this.abortControllers.set(chatId, abortController);
    }

    let tools: OpenAITool[] = [];
    try {
      tools = await this.getMCPTools(mcpServers as Record<string, MCPServerConfig>, allowedTools);
      console.log(`[Bedrock] Available MCP tools: ${tools.length}`);
    } catch (error) {
      console.error('[Bedrock] Failed to get MCP tools:', (error as Error).message);
    }

    let turnCount = 0;

    while (turnCount < maxTurns) {
      turnCount++;
      console.log(`[Bedrock] Turn ${turnCount}/${maxTurns}`);

      const requestBody: Record<string, unknown> = {
        model: modelToUse,
        max_tokens: 4096,
        messages: conversationMessages,
        stream: true
      };

      if (tools.length > 0) {
        requestBody.tools = tools;
      }

      try {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'open-claude-cowork/1.0'
          },
          body: JSON.stringify(requestBody),
          signal: abortController.signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          yield { type: 'error', message: `Bedrock API error: ${response.status} - ${errorText}`, provider: this.name };
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let fullReasoning = '';
        let toolCalls: ToolCall[] = [];
        let finishReason: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;
            
            const dataStr = trimmedLine.slice(5).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const data = JSON.parse(dataStr);
              const delta = data.choices?.[0]?.delta;
              finishReason = data.choices?.[0]?.finish_reason || finishReason;
              
              if (delta) {
                // GLM-5 uses reasoning_content for thinking
                if (delta.reasoning_content) {
                  fullReasoning += delta.reasoning_content;
                  yield {
                    type: 'text',
                    content: delta.reasoning_content,
                    provider: this.name,
                    isReasoning: true
                  };
                }
                
                if (delta.content) {
                  fullContent += delta.content;
                  yield {
                    type: 'text',
                    content: delta.content,
                    provider: this.name
                  };
                }

                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const index = tc.index;
                    if (!toolCalls[index]) {
                      toolCalls[index] = {
                        id: tc.id,
                        type: 'function',
                        function: {
                          name: '',
                          arguments: ''
                        }
                      };
                    }
                    if (tc.id) toolCalls[index].id = tc.id;
                    if (tc.function?.name) toolCalls[index].function.name = tc.function.name;
                    if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
                  }
                }
              }
            } catch (parseError) {
              console.error('[Bedrock] Parse error for line:', dataStr.substring(0, 100), (parseError as Error).message);
            }
          }
        }

        reader.cancel();

        if (finishReason === 'tool_calls' && toolCalls.length > 0) {
          console.log(`[Bedrock] Tool calls requested: ${toolCalls.length}`);
          
          const assistantMessage: ConversationMessage = {
            role: 'assistant',
            content: fullContent || null,
            tool_calls: toolCalls.map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments
              }
            }))
          };
          
          if (fullReasoning) {
            assistantMessage.reasoning_content = fullReasoning;
          }
          
          conversationMessages.push(assistantMessage);

          for (const tc of toolCalls) {
            const toolName = tc.function.name;
            const toolArgs = tc.function.arguments;
            const toolCallId = tc.id;
            
            yield {
              type: 'tool_use',
              name: toolName,
              id: toolCallId,
              input: toolArgs, // Keep as string, per StreamChunk type
              provider: this.name
            };

            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(toolArgs);
            } catch {
              parsedArgs = {};
            }

            const toolResult = await this.executeToolCall(
              toolCallId,
              toolName,
              parsedArgs,
              mcpServers as Record<string, MCPServerConfig>
            );

            yield {
              type: 'tool_result',
              tool_use_id: toolCallId,
              result: toolResult.content,
              provider: this.name
            };

            conversationMessages.push(toolResult);
          }

          continue;
        }

        if (chatId && fullContent) {
          this.setHistory(chatId, 'user', prompt);
          this.setHistory(chatId, 'assistant', fullContent);
        }

        yield { type: 'done', provider: this.name };
        return;

      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          yield { type: 'aborted', provider: this.name };
        } else {
          console.error('[Bedrock] Query error:', error);
          yield { type: 'error', message: (error as Error).message, provider: this.name };
        }
        return;
      } finally {
        if (chatId) {
          this.abortControllers.delete(chatId);
        }
      }
    }

    yield { type: 'done', provider: this.name };
  }
}
