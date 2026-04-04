import { createOpencode, createOpencodeClient, type OpencodeClient as SDKOpencodeClient } from '@opencode-ai/sdk';
import { BaseProvider, type QueryParams, type ProviderConfig } from './base-provider.js';
import type { StreamChunk } from '@normie/types';

/**
 * Opencode event properties
 */
interface EventProperties {
  part?: Part;
  sessionID?: string;
  session?: { id?: string };
  message?: { info?: { role?: string; id?: string } };
}

/**
 * Opencode part types
 */
interface Part {
  type?: string;
  text?: string;
  reasoning?: string;
  messageID?: string;
  id?: string;
  sessionID?: string;
  tool?: string;
  toolName?: string;
  name?: string;
  toolInvocationId?: string;
  callID?: string;
  tool_invocation_id?: string;
  state?: { status?: string; input?: Record<string, unknown> };
  args?: Record<string, unknown>;
  input?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  params?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
  result?: unknown;
  output?: unknown;
  content?: unknown;
}

/**
 * Opencode event
 */
interface OpencodeEvent {
  type: string;
  properties?: EventProperties;
}

/**
 * MCP server configuration
 */
interface MCPServerConfig {
  type: 'http' | 'remote' | 'local';
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  environment?: Record<string, string>;
}

/**
 * Opencode SDK provider implementation
 * Adapts Opencode SDK to match the same interface as Claude provider
 */
export class OpencodeProvider extends BaseProvider {
  private client: SDKOpencodeClient | null = null;
  private serverInstance: { close: () => void } | null = null;
  private defaultModel: string | undefined;
  private hostname: string;
  private port: number;
  private useExistingServer: boolean;
  private existingServerUrl: string | null;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config: ProviderConfig = {}) {
    super(config);
    this.defaultModel = config.model as string | undefined;
    this.hostname = (config.hostname as string) || '127.0.0.1';
    this.port = (config.port as number) || 4096;
    this.useExistingServer = (config.useExistingServer as boolean) || false;
    this.existingServerUrl = (config.existingServerUrl as string) || null;
  }

  get name(): string {
    return 'opencode';
  }

  /**
   * Abort an active query for a given chatId
   */
  override abort(chatId: string): boolean {
    const controller = this.abortControllers.get(chatId);
    if (controller) {
      console.log('[Opencode] Aborting query for chatId:', chatId);
      controller.abort();
      this.abortControllers.delete(chatId);
      return true;
    }
    return false;
  }

  /**
   * Initialize the Opencode client/server
   */
  async initialize(): Promise<void> {
    if (this.client) return;

    try {
      if (this.useExistingServer && this.existingServerUrl) {
        // Connect to existing Opencode server
        console.log('[Opencode] Connecting to existing server:', this.existingServerUrl);
        this.client = createOpencodeClient({
          baseUrl: this.existingServerUrl
        });
      } else {
        // Create new Opencode server and client
        console.log('[Opencode] Creating new server on', this.hostname, ':', this.port);
        const { client, server } = await createOpencode({
          hostname: this.hostname,
          port: this.port
        });
        this.client = client;
        this.serverInstance = server;
      }
      console.log('[Opencode] Initialized successfully');
    } catch (error) {
      console.error('[Opencode] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Execute a query using Opencode SDK
   * Matches the same interface as Claude provider
   */
  async *query(params: QueryParams): AsyncGenerator<StreamChunk> {
    const {
      prompt,
      messages,       // Conversation history from project-level memory
      systemPrompt,   // Workspace context (SOUL.md, MEMORY.md, etc.)
      chatId,
      sessionId: dbSessionId,  // Session ID from database
      model
    } = params;

    // Use provided model or fall back to default
    const modelToUse = model || this.defaultModel || 'opencode/big-pickle';
    console.log('[Opencode] Using model:', modelToUse);

    // Ensure client is initialized
    await this.initialize();

    // Check for existing session - prefer DB session over in-memory
    let sessionId: string | null = dbSessionId || (chatId ? this.getSession(chatId) : null);
    console.log('[Opencode] Session for', chatId, ':', sessionId || 'new');

    // Build the full prompt from conversation history
    // This enables project-level memory that persists across providers
    let fullPrompt: string;
    
    if (messages && messages.length > 0) {
      // Use conversation history
      fullPrompt = this.buildPromptFromHistory(
        messages as Array<{ role: 'user' | 'assistant'; content: string }>, 
        systemPrompt
      );
      console.log('[Opencode] Using conversation history, messages:', messages.length);
    } else if (systemPrompt) {
      // Just system prompt + current message
      fullPrompt = `${systemPrompt}\n\n---\n\nUser: ${prompt}`;
    } else {
      // Just the current message
      fullPrompt = prompt;
    }

    console.log('[Opencode] Prompt length:', fullPrompt.length);

    // Create abort controller for this request
    const abortController = new AbortController();
    if (chatId) {
      this.abortControllers.set(chatId, abortController);
    }

    try {
      // Note: MCP servers are configured in opencode.json, not passed via API
      // The backend server.js writes the Composio MCP URL to opencode.json

      // Create session if needed
      if (!sessionId) {
        console.log('[Opencode] Creating session with model:', modelToUse);
        // The SDK expects body with config nested inside, but types say otherwise
        // Use type assertion to work around SDK type mismatch
        const sessionResult = await this.client!.session.create({
          body: {
            config: {
              model: modelToUse
            }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any
        });
        // Handle the union type from the SDK
        if ('data' in sessionResult && sessionResult.data) {
          sessionId = sessionResult.data.id || null;
        }
        if (chatId && sessionId) {
          this.setSession(chatId, sessionId);
        }
        console.log('[Opencode] Session:', sessionId);

        yield {
          type: 'session_init',
          session_id: sessionId!,
          provider: this.name
        };
      } else {
        // We have an existing session - yield session_init so server can save it
        console.log('[Opencode] Resuming existing session:', sessionId);
        yield {
          type: 'session_init',
          session_id: sessionId,
          provider: this.name
        };
      }

      // Parse model string into providerID and modelID
      const [providerID, ...modelParts] = modelToUse.split('/');
      const modelID = modelParts.join('/');

      console.log('[Opencode] Subscribing to events...');

      // Subscribe to events for streaming
      const events = await this.client!.event.subscribe();

      // Send prompt async (returns immediately, results come via events)
      console.log('[Opencode] Sending prompt async...');
      await this.client!.session.promptAsync({
        path: { id: sessionId! },
        body: {
          model: { providerID, modelID },
          parts: [{ type: 'text', text: fullPrompt }]
        }
      });

      console.log('[Opencode] Listening for events...');

      // Track assistant's text parts (accumulates as streaming happens)
      let userMessageId: string | null = null;
      const lastYieldedLength = new Map<string, number>(); // partId -> length already yielded
      const yieldedToolCalls = new Set<string>(); // callID -> prevent duplicate tool yields

      // Listen to event stream
      for await (const event of events.stream) {
        // Check if aborted
        if (abortController.signal.aborted) {
          console.log('[Opencode] Query aborted, breaking event loop');
          break;
        }

        const props = event.properties || {};
        // Cast props to our interface for property access
        const typedProps = props as unknown as EventProperties;
        const part = typedProps.part || (event as unknown as Part);
        const eventSessionId = typedProps.sessionID || part?.sessionID || typedProps.session?.id;

        // Filter events for our session
        if (eventSessionId && eventSessionId !== sessionId) {
          continue;
        }

        if (event.type === 'message.part.updated') {
          const messageId = part?.messageID;
          const partId = part?.id;

          // Skip user's message (first text message we see)
          if (!userMessageId && part?.type === 'text') {
            userMessageId = messageId || null;
            continue;
          }

          // Skip parts from user's message
          if (messageId === userMessageId) {
            continue;
          }

          // Handle streaming text - yield only the NEW delta
          if (part?.type === 'text' && part?.text) {
            const prevLength = lastYieldedLength.get(partId!) || 0;
            const fullText = part.text;

            if (fullText.length > prevLength) {
              const delta = fullText.slice(prevLength);
              yield {
                type: 'text',
                content: delta,
                provider: this.name
              };
              lastYieldedLength.set(partId!, fullText.length);
            }
          } else if (part?.type === 'reasoning') {
            const text = part.reasoning || part.text || '';
            const prevLength = lastYieldedLength.get(partId!) || 0;

            if (text.length > prevLength) {
              const delta = text.slice(prevLength);
              yield {
                type: 'text',
                content: delta,
                provider: this.name,
                isReasoning: true
              };
              lastYieldedLength.set(partId!, text.length);
            }
          } else if (
            part?.type === 'tool-invocation' || 
            part?.type === 'tool_invocation' || 
            part?.type === 'tool'
          ) {
            const toolId = part.toolInvocationId || part.callID || part.id || part.tool_invocation_id;

            // Skip if we've already yielded this tool call
            if (toolId && yieldedToolCalls.has(toolId)) {
              continue;
            }
            if (part.state?.status === 'pending') {
              console.log('[Opencode] Skipping pending tool call:', part.tool);
              continue;
            }

            const toolName = part.toolName || part.tool || part.name;
            const toolArgs = part.state?.input || part.args || part.input || part.parameters || part.params || part.toolInput || {};

            console.log('[Opencode] Tool:', toolName, 'args:', JSON.stringify(toolArgs).slice(0, 80));

            if (toolId) {
              yieldedToolCalls.add(toolId);
            }

            yield {
              type: 'tool_use',
              name: toolName || 'unknown',
              input: toolArgs,
              id: toolId || `tool-${Date.now()}`,
              provider: this.name
            };
          } else if (part?.type === 'tool-result' || part?.type === 'tool_result') {
            const toolId = part.toolInvocationId || part.callID || part.id || part.tool_invocation_id;
            const resultData = part.result || part.output || part.content;
            console.log('[Opencode] Tool result detected:', toolId, 'result:', JSON.stringify(resultData).slice(0, 100));
            yield {
              type: 'tool_result',
              result: resultData,
              tool_use_id: toolId || 'unknown',
              provider: this.name
            };
          } else if (part?.type === 'step-start' || part?.type === 'step-finish') {
            // Skip step markers
            console.log('[Opencode] Skipping step marker:', part.type);
          } else if (part?.type) {
            console.log('[Opencode] Unhandled part type:', part.type, 'full part:', JSON.stringify(part).slice(0, 200));
          }
        } else if (event.type === 'message.updated') {
          // Just log - parts come from message.part.updated, not here
          const message = typedProps.message;
          console.log(' Msg updated:', message?.info?.role, 'id:', message?.info?.id?.slice(-10));
        } else if (event.type === 'session.idle') {
          console.log('[Opencode] Session idle - done');
          break;
        } else if (event.type === 'session.error') {
          console.error('[Opencode] Session error:', props);
          yield {
            type: 'error',
            message: (props as unknown as { message?: string }).message || 'Session error',
            provider: this.name
          };
          break;
        }
      }

      // Check if we were aborted
      if (abortController.signal.aborted) {
        yield {
          type: 'aborted',
          provider: this.name
        };
        console.log('[Opencode] Stream aborted');
      } else {
        yield {
          type: 'done',
          provider: this.name
        };
        console.log('[Opencode] Stream completed');
      }

    } catch (error) {
      console.error('[Opencode] Query error:', error);
      yield {
        type: 'error',
        message: (error as Error).message,
        provider: this.name
      };
    } finally {
      // Clean up abort controller
      if (chatId) {
        this.abortControllers.delete(chatId);
      }
    }
  }

  /**
   * Cleanup resources
   */
  override async cleanup(): Promise<void> {
    await super.cleanup();
    if (this.serverInstance) {
      // Close server if we created it
      try {
        this.serverInstance.close();
        console.log('[Opencode] Server closed');
      } catch (e) {
        console.error('[Opencode] Error closing server:', e);
      }
    }
    this.client = null;
    this.serverInstance = null;
  }
}
