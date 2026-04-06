/**
 * Pi Agent Main Module
 * 
 * Provides the main entry point for creating Pi Agent sessions
 * and initializing the Pi Agent on server startup.
 * 
 * Credential Flow:
 * - Simple API keys (Anthropic, OpenAI, etc): Injected via AuthStorage.inMemory()
 * - AWS Bedrock Mantle: Uses BEDROCK_API_KEY + BEDROCK_BASE_URL (OpenAI-compatible API)
 * - AWS Bedrock Native: Uses environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION)
 * - Owner-managed: Bedrock credentials are server-level, not user-configurable
 */

import {
  createAgentSession,
  AuthStorage,
  type AgentSession,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import { getModel, type Model } from "@mariozechner/pi-ai";
import { loadPiConfig, validatePiConfig, getValidatedModel, PROVIDER_ALIAS } from "./config.js";
import { NormieSessionManager } from "./session-manager.js";
import { EventAdapter } from "./event-adapter.js";
import { buildWorkspaceTools, type ToolBuilderOptions } from "./tools/index.js";
import type { ResolvedCredentials } from "./credentials.js";
import type { StreamChunk } from '@normie/types';
import { streamBedrockMantle, getBedrockMantleConfig, isBedrockMantleModel } from '../providers/bedrock-mantle-provider.js';

export interface CreatePiSessionParams {
  workspaceId: string;
  chatId: string;
  userId: string;
  provider: string;
  model: string;
}

/**
 * Options for running a query with Pi Agent
 */
export interface RunPiQueryOptions {
  /** Provider name (e.g., 'anthropic', 'openai', 'bedrock') */
  provider: string;
  /** Model ID (e.g., 'claude-opus-4-5') */
  model: string;
  /** Workspace ID for tools and context */
  workspaceId: string;
  /** Chat ID for session management */
  chatId: string;
  /** User ID for Composio entity isolation */
  userId: string;
  /** System prompt from context builder */
  systemPrompt?: string;
  /** Conversation history with current message */
  messages: Array<{ role: string; content: string }>;
  /** Composio client for workspace integrations */
  composioClient?: unknown;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Existing session ID from DB (for resumption) */
  sessionId?: string;
  /** Pre-resolved credentials (for simple API key providers) */
  credentials: ResolvedCredentials;
}

/**
 * Map Pi provider names to AuthStorage provider IDs.
 */
function getAuthProviderId(piProvider: string): string {
  const mapping: Record<string, string> = {
    'anthropic': 'anthropic',
    'openai': 'openai',
    'google': 'google',
    'groq': 'groq',
    'xai': 'xai',
    'mistral': 'mistral',
    'openrouter': 'openrouter',
    'cerebras': 'cerebras',
    'kimi-coding': 'kimi-coding',
    'opencode': 'opencode',
    'minimax': 'minimax',
    'zai': 'zai',
  };
  return mapping[piProvider] || piProvider;
}

/**
 * Check if provider uses environment variables for credentials.
 * AWS Bedrock reads from env vars directly via AWS SDK.
 */
function isEnvBasedProvider(piProvider: string): boolean {
  return piProvider === 'amazon-bedrock' || piProvider === 'azure-openai-responses';
}

/**
 * Create an AuthStorage with pre-injected credentials.
 * 
 * Note: AWS Bedrock is NOT handled here - it uses environment variables
 * directly via AWS SDK credential chain.
 */
function createAuthStorageWithCredentials(
  provider: string,
  credentials: ResolvedCredentials
): AuthStorage {
  console.log(`[PiAgent:AuthStorage] Creating auth storage for provider: ${provider}`);
  console.log(`[PiAgent:AuthStorage] Credentials source: ${credentials.source}`);
  
  const authProviderId = getAuthProviderId(provider);
  
  // Build auth data for in-memory storage
  const authData: Record<string, { type: 'api_key'; key: string }> = {};
  
  // Skip environment-based providers (they read from process.env directly)
  if (isEnvBasedProvider(provider)) {
    console.log(`[PiAgent:AuthStorage] Provider ${provider} uses environment variables - skipping AuthStorage injection`);
    return AuthStorage.inMemory({});
  }
  
  if (credentials.configured && credentials.apiKey) {
    authData[authProviderId] = {
      type: 'api_key',
      key: credentials.apiKey,
    };
    console.log(`[PiAgent:AuthStorage] Injected API key for ${authProviderId}`);
  }
  
  return AuthStorage.inMemory(authData);
}

/**
 * Run a query with Pi Agent and stream events through the EventAdapter.
 * 
 * This is the main entry point for chat queries. It:
 * 1. Validates credentials (from DB for user keys, from env for owner keys)
 * 2. Creates AuthStorage with injected credentials (for simple API key providers)
 * 3. Creates AgentSession via SDK
 * 4. Subscribes to events and streams responses
 * 
 * @yields StreamChunk events compatible with the frontend SSE format
 */
export async function* runPiQuery(
  options: RunPiQueryOptions
): AsyncGenerator<StreamChunk> {
  const {
    provider,
    model,
    workspaceId,
    chatId,
    userId,
    systemPrompt,
    messages,
    composioClient,
    signal,
    sessionId,
    credentials,
  } = options;

  console.log('='.repeat(60));
  console.log('[PiAgent] Running query');
  console.log(`[PiAgent] Provider: ${provider}`);
  console.log(`[PiAgent] Model: ${model}`);
  console.log(`[PiAgent] Workspace: ${workspaceId}`);
  console.log(`[PiAgent] Chat: ${chatId}`);
  console.log(`[PiAgent] User: ${userId}`);
  console.log(`[PiAgent] Session: ${sessionId || 'new'}`);
  console.log('='.repeat(60));

  // Resolve Pi provider name (handle aliases)
  const piProvider = PROVIDER_ALIAS[provider] || provider;
  console.log(`[PiAgent] Pi provider ID: ${piProvider}`);

  // Check if this is an environment-based provider
  const isEnvProvider = isEnvBasedProvider(piProvider);
  
  // Validate credentials
  if (!credentials.configured && !isEnvProvider) {
    console.error('[PiAgent] ERROR: Credentials not configured');
    yield {
      type: 'error',
      message: credentials.error || `No API key configured for ${provider}`,
      provider,
    };
    return;
  }

  console.log(`[PiAgent] Credentials source: ${credentials.source}`);
  console.log(`[PiAgent] Is environment-based provider: ${isEnvProvider}`);

  // For Bedrock, check if using Mantle or native
  if (piProvider === 'amazon-bedrock') {
    const useMantle = credentials.streamOptions?.useMantle === true;
    
    if (useMantle) {
      console.log(`[PiAgent] Using Bedrock Mantle (OpenAI-compatible API)`);
      console.log(`[PiAgent]   BEDROCK_API_KEY: ${process.env.BEDROCK_API_KEY ? '***' + process.env.BEDROCK_API_KEY.slice(-8) : 'NOT SET'}`);
      console.log(`[PiAgent]   BEDROCK_BASE_URL: ${process.env.BEDROCK_BASE_URL || 'NOT SET'}`);
    } else {
      console.log(`[PiAgent] Using native Bedrock (Converse API)`);
      console.log(`[PiAgent]   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '***' + process.env.AWS_ACCESS_KEY_ID.slice(-4) : 'NOT SET'}`);
      console.log(`[PiAgent]   AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '[SET]' : 'NOT SET'}`);
      console.log(`[PiAgent]   AWS_REGION: ${process.env.AWS_REGION || 'us-east-1'}`);
    }
  }

  // Get validated model
  let piModel: Model<any>;
  try {
    piModel = getValidatedModel(provider, model);
    console.log(`[PiAgent] Model validated: ${piModel.name}`);
  } catch (error) {
    console.error('[PiAgent] Model validation failed:', (error as Error).message);
    yield {
      type: 'error',
      message: (error as Error).message,
      provider,
    };
    return;
  }

  // Create event adapter
  const eventAdapter = new EventAdapter({
    provider,
    chatId,
    sessionId,
  });

  // Build workspace tools
  console.log('[PiAgent] Building workspace tools...');
  const toolOptions: ToolBuilderOptions = {
    workspaceId,
    userId,
    composioClient: composioClient as any,
    includeCodingTools: true,
    includeWebTools: true,
    includeComposioTools: !!composioClient,
  };
  
  const tools = await buildWorkspaceTools(toolOptions);
  console.log(`[PiAgent] Built ${tools.length} tools`);

  // Create AuthStorage with injected credentials
  const authStorage = createAuthStorageWithCredentials(piProvider, credentials);

  // CHECK: Use Bedrock Mantle (OpenAI-compatible API) if configured
  const useMantle = piProvider === 'amazon-bedrock' && credentials.streamOptions?.useMantle === true;
  
  if (useMantle) {
    console.log('[PiAgent] Using Bedrock Mantle provider (OpenAI-compatible API)');
    
    // Get Mantle config
    const mantleConfig = getBedrockMantleConfig();
    if (!mantleConfig) {
      yield {
        type: 'error',
        message: 'Bedrock Mantle not configured. Set BEDROCK_API_KEY and BEDROCK_BASE_URL.',
        provider,
      };
      return;
    }
    
    // Build messages for Mantle API
    const mantleMessages = [] as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    
    // Add system prompt if present
    if (systemPrompt) {
      mantleMessages.push({ role: 'system', content: systemPrompt });
    }
    
    // Add conversation messages
    for (const msg of messages) {
      mantleMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
    }
    
    // Create Mantle config with model
    const mantleConfigWithModel = {
      ...mantleConfig,
      model: piModel.id, // Use the model ID directly (e.g., 'zai.glm-5')
    };
    
    console.log(`[PiAgent] Streaming from Mantle with model: ${mantleConfigWithModel.model}`);
    
    // Stream from Mantle and yield chunks
    try {
      for await (const chunk of streamBedrockMantle(mantleConfigWithModel, mantleMessages, signal)) {
        yield chunk;
      }
    } catch (error) {
      console.error('[PiAgent] Mantle stream error:', error);
      yield {
        type: 'error',
        message: (error as Error).message,
        provider,
      };
    }
    
    console.log('[PiAgent] Mantle stream complete');
    return;
  }

  // Create AgentSession using SDK (for all other providers)
  console.log('[PiAgent] Creating AgentSession...');
  console.log(`[PiAgent] Model: ${piModel.id} (${piModel.name})`);
  console.log(`[PiAgent] Model provider: ${piModel.provider}`);
  
  let session: AgentSession;
  let extensionsResult: any;
  
  try {
    // Log auth storage state
    console.log(`[PiAgent] AuthStorage state: ${JSON.stringify(Object.keys(authStorage as any).length)} keys`);
    
    const result = await createAgentSession({
      authStorage,
      model: piModel,
      thinkingLevel: 'medium',
      tools: tools as any,
      customTools: [],
    });
    
    session = result.session;
    extensionsResult = result.extensionsResult;
    
    console.log('[PiAgent] AgentSession created successfully');
    console.log(`[PiAgent] Extensions loaded: ${extensionsResult?.extensions?.length || 0}`);
    
    if (result.modelFallbackMessage) {
      console.log(`[PiAgent] Model fallback: ${result.modelFallbackMessage}`);
    }
  } catch (error) {
    console.error('[PiAgent] Failed to create AgentSession:', error);
    yield {
      type: 'error',
      message: `Failed to initialize agent: ${(error as Error).message}`,
      provider,
    };
    return;
  }

  // Queue to collect events from the session
  const eventQueue: StreamChunk[] = [];
  let resolveEventPromise: ((value: IteratorResult<StreamChunk>) => void) | null = null;
  let done = false;
  let errorMessage: string | null = null;

  // Subscribe to session events
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    console.log(`[PiAgent:Event] Received: ${event.type}`);
    
    // Log full event for debugging
    if (event.type === 'agent_end') {
      console.log(`[PiAgent:Event] Full agent_end event:`, JSON.stringify(event, null, 2));
    }
    if (event.type === 'message_update') {
      console.log(`[PiAgent:Event] Full message_update event:`, JSON.stringify(event, null, 2));
    }
    
    // Translate to StreamChunk
    const chunk = translateSessionEvent(event, eventAdapter);
    
    if (chunk) {
      if (resolveEventPromise) {
        resolveEventPromise({ value: chunk, done: false });
        resolveEventPromise = null;
      } else {
        eventQueue.push(chunk);
      }
    }

    // Check for completion
    if (event.type === 'agent_end') {
      console.log('[PiAgent:Event] Agent completed');
      done = true;
      if (resolveEventPromise) {
        resolveEventPromise({ value: undefined as any, done: true });
        resolveEventPromise = null;
      }
    }
    
    // Track errors
    if (event.type === 'agent_end' && 'error' in event && event.error) {
      errorMessage = String(event.error);
    }
  });

  // Yield initial connected event
  yield {
    type: 'connected',
    message: 'Processing request...',
  };

  try {
    // Build the prompt text from messages
    // The last message is the current user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    
    if (!lastUserMessage) {
      throw new Error('No user message found in context');
    }

    console.log(`[PiAgent] Sending prompt: "${lastUserMessage.content.substring(0, 100)}..."`);

    // Send prompt to session
    await session.prompt(lastUserMessage.content);

    // Yield events as they come
    while (!done) {
      // Check for abort
      if (signal?.aborted) {
        console.log('[PiAgent] Request aborted by client');
        await session.abort();
        yield eventAdapter.translateAbort();
        break;
      }

      // Check if there's an event in the queue
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!;
        continue;
      }

      // Wait for the next event
      const eventPromise = new Promise<IteratorResult<StreamChunk>>((resolve) => {
        resolveEventPromise = resolve;
      });

      // Wait with timeout to allow abort checking
      const timeoutPromise = new Promise<IteratorResult<StreamChunk>>((resolve) => {
        setTimeout(() => {
          if (!done) {
            resolve({ value: undefined as any, done: false });
          }
        }, 100);
      });

      const result = await Promise.race([eventPromise, timeoutPromise]);

      if (result.done) {
        done = true;
        break;
      }

      if (result.value) {
        yield result.value;
      }
    }

    // Yield any remaining events
    while (eventQueue.length > 0) {
      yield eventQueue.shift()!;
    }

    // Check for errors
    if (errorMessage) {
      console.error('[PiAgent] Agent ended with error:', errorMessage);
      yield {
        type: 'error',
        message: errorMessage,
        provider,
      };
    }

    console.log('[PiAgent] Query completed successfully');

  } catch (error) {
    console.error('[PiAgent] Query error:', error);
    
    if ((error as Error).name === 'AbortError' || signal?.aborted) {
      console.log('[PiAgent] Query aborted');
      yield eventAdapter.translateAbort();
    } else {
      yield {
        type: 'error',
        message: (error as Error).message,
        provider,
      };
    }
  } finally {
    unsubscribe();
    console.log('[PiAgent] Session cleanup complete');
    console.log('='.repeat(60));
  }
}

/**
 * Translate AgentSessionEvent to StreamChunk format.
 */
function translateSessionEvent(
  event: AgentSessionEvent,
  adapter: EventAdapter
): StreamChunk | null {
  // Log all event details for debugging
  console.log(`[PiAgent:Translate] Event type: ${event.type}`);
  
  switch (event.type) {
    case 'agent_start':
      return {
        type: 'session_init',
        session_id: adapter.sessionId || 'new',
        provider: adapter.provider,
      };
      
    case 'message_update':
      console.log('[PiAgent:Translate] Processing message_update');
      return adapter.translate(event as any);
      
    case 'tool_execution_start':
    case 'tool_execution_end':
      return adapter.translate(event as any);
      
    case 'agent_end':
      // Check for error in agent_end
      if ('error' in event && event.error) {
        console.log('[PiAgent:Translate] Agent ended with error:', event.error);
      }
      return { type: 'done', provider: adapter.provider };
      
    case 'turn_start':
    case 'turn_end':
    case 'message_start':
    case 'message_end':
      return null;
      
    default:
      console.log(`[PiAgent:Event] Unhandled event type: ${(event as any).type}`);
      return null;
  }
}

/**
 * Initialize Pi Agent on server startup
 * 
 * Validates configuration and logs Pi Agent status.
 */
export async function initializePiAgent(): Promise<void> {
  console.log("[PiAgent] Initializing...");

  // Load and validate config
  const config = loadPiConfig();
  validatePiConfig(config);

  console.log("[PiAgent] Configuration:");
  console.log(`  Default provider: ${config.defaultProvider}`);
  console.log(`  Default model: ${config.defaultModel}`);
  console.log(`  Enabled providers: ${config.enabledProviders.join(", ")}`);

  // Log AWS Bedrock configuration
  if (process.env.AWS_ACCESS_KEY_ID) {
    console.log("[PiAgent] AWS Bedrock configured:");
    console.log(`  Access Key: ***${process.env.AWS_ACCESS_KEY_ID.slice(-4)}`);
    console.log(`  Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  } else {
    console.log("[PiAgent] AWS Bedrock: Not configured (no AWS_ACCESS_KEY_ID)");
  }

  // Try to get default model info
  try {
    const defaultModel = getModel(config.defaultProvider as any, config.defaultModel as any);
    if (defaultModel) {
      console.log(`[PiAgent] Default model info:`);
      console.log(`  Name: ${defaultModel.name}`);
      console.log(`  Context window: ${defaultModel.contextWindow} tokens`);
      console.log(`  Max output: ${defaultModel.maxTokens} tokens`);
      
      if (defaultModel.cost) {
        console.log(
          `  Cost: $${defaultModel.cost.input}/M input, ` +
          `$${defaultModel.cost.output}/M output`
        );
      }
    }
  } catch (error) {
    console.log(
      `[PiAgent] Could not load default model info: ${(error as Error).message}`
    );
  }

  console.log("[PiAgent] Initialized successfully");
}

// Re-export config functions
export { loadPiConfig, validatePiConfig, getValidatedModel, getEnabledProviders } from "./config.js";

// Re-export session manager and event adapter for consumers
export { NormieSessionManager } from "./session-manager.js";
export { EventAdapter } from "./event-adapter.js";

// Re-export tools
export { buildWorkspaceTools, type ToolBuilderOptions } from "./tools/index.js";
export { getComposioClient } from "./tools/composio-tools.js";

// Re-export credentials
export { resolveCredentials, type ResolvedCredentials } from "./credentials.js";