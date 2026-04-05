import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

// Load env FIRST before other imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

// Now import modules that depend on env vars
import { Composio }from '@composio/core';
import { getProvider, getAvailableProviders, initializeProviders } from './providers/index.js';
import { getDb, closeDb } from './db/index.js';
import { initializeDatabase, setupVectorSupport } from './db/init.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import chatRoutes from './routes/chats.js';
import apiKeyRoutes from './routes/api-keys.js';
import memoryRoutes from './routes/memories.js';
import integrationRoutes from './routes/integrations.js';
import * as schema from './db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { buildFullContext } from './services/context-builder.js';
import { generateConversationTitle } from './services/title-generator.js';
import type { Provider } from '@normie/types';

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'renderer')));

// Middleware - CORS configuration for cookie-based auth
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like Electron app) or from localhost
    if (!origin || 
        origin.startsWith('http://localhost:') || 
        origin.startsWith('http://127.0.0.1:') ||
        origin === 'null') { // file:// URLs appear as 'null' origin
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(cookieParser());

// ============================================
// API ROUTES
// ============================================

// Health check (public)
app.get('/api/health', async (_req, res) => {
  try {
    const db = getDb();
    await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
      providers: getAvailableProviders()
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: (error as any)?.message || 'Unknown error'
    });
  }
});

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/memories', memoryRoutes);
app.use('/api/integrations', integrationRoutes);

// ============================================
// LEGACY CHAT ENDPOINT (for backward compatibility)
// ============================================
app.post('/api/chat', async (req, res) => {
  const {
    message,
    chatId,
    userId,
    provider: providerName = 'claude',
    model = null,
    workspaceId: requestWorkspaceId = null
  } = req.body;

  console.log('[CHAT] Request received:', message);
  console.log('[CHAT] Chat ID:', chatId);
  console.log('[CHAT] Provider:', providerName);
  console.log('[CHAT] Model:', model || '(default)');
  console.log('[CHAT] User ID:', userId || '(not provided)');
  console.log('[CHAT] Workspace ID:', requestWorkspaceId || '(from chat)');

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'User ID required. Please login.' });
  }

  // Validate provider
  const availableProviders = getAvailableProviders();
  if (!availableProviders.includes(providerName.toLowerCase())) {
    return res.status(400).json({
      error: `Invalid provider: ${providerName}. Available: ${availableProviders.join(', ')}`
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Processing request...' })}\n\n`);

  const heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 15000);

  res.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  try {
    // Get Composio session helpers
    const { getOrCreateWorkspaceSession, defaultComposioSession } = await getComposioSession(userId);

    // Get the provider instance
    const provider = getProvider(providerName);

    // Helper to check if string is valid UUID
    const isValidUUID = (str: string) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    };

    // Ensure chat exists in database (auto-create if needed)
    const db = getDb();
    let resolvedWorkspaceId = requestWorkspaceId;
    let dbChatId = chatId;  // Track the actual DB chat ID
    let existingSessionId: string | undefined = undefined;
    let existingSessionProvider: string | null = null;
    
    if (chatId) {
      // Check if chatId is a valid UUID - if not, we need to create a new chat
      if (!isValidUUID(chatId)) {
        console.log('[CHAT] Non-UUID chatId provided, will create new chat');
        
        // Resolve workspaceId - use provided or get user's default
        if (!resolvedWorkspaceId) {
          const [defaultWorkspace] = await db.select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.ownerId, userId))
            .limit(1);
          
          if (defaultWorkspace) {
            resolvedWorkspaceId = defaultWorkspace.id;
            console.log('[CHAT] Using default workspace:', resolvedWorkspaceId);
          }
        }
        
        if (!resolvedWorkspaceId) {
          console.log('[CHAT] No workspace available, creating default...');
          const [newWorkspace] = await db.insert(schema.workspaces)
            .values({
              ownerId: userId,
              name: 'Default Workspace',
              isDefault: true
            })
            .returning({ id: schema.workspaces.id, name: schema.workspaces.name });
          
          resolvedWorkspaceId = newWorkspace.id;
          console.log('[CHAT] Created workspace:', resolvedWorkspaceId);
          
          await db.insert(schema.workspaceFiles).values([
            { workspaceId: resolvedWorkspaceId, filename: 'SOUL.md', content: '' },
            { workspaceId: resolvedWorkspaceId, filename: 'MEMORY.md', content: '' },
            { workspaceId: resolvedWorkspaceId, filename: 'AGENTS.md', content: '' }
          ]);
        }
        
        // Create the chat with a proper UUID (auto-generated by DB)
        const [newChat] = await db.insert(schema.chats)
          .values({
            workspaceId: resolvedWorkspaceId,
            userId,
            title: message.substring(0, 100),
            provider: providerName,
            model
          })
          .returning({ id: schema.chats.id });
        
        dbChatId = newChat.id;
        console.log('[CHAT] Created new chat with UUID:', dbChatId);
      } else {
        // Valid UUID - check if chat exists
        const [existingChat] = await db.select()
          .from(schema.chats)
          .where(eq(schema.chats.id, chatId))
          .limit(1);
        
        if (!existingChat) {
          // Chat doesn't exist - create it
          console.log('[CHAT] Chat not found in DB, creating:', chatId);
          
          if (!resolvedWorkspaceId) {
            const [defaultWorkspace] = await db.select()
              .from(schema.workspaces)
              .where(eq(schema.workspaces.ownerId, userId))
              .limit(1);
            
            if (defaultWorkspace) {
              resolvedWorkspaceId = defaultWorkspace.id;
            }
          }
          
          if (!resolvedWorkspaceId) {
            const [newWorkspace] = await db.insert(schema.workspaces)
              .values({
                ownerId: userId,
                name: 'Default Workspace',
                isDefault: true
              })
              .returning({ id: schema.workspaces.id });
            
            resolvedWorkspaceId = newWorkspace.id;
          }
          
          await db.insert(schema.chats).values({
            id: chatId,
            workspaceId: resolvedWorkspaceId,
            userId,
            title: message.substring(0, 100),
            provider: providerName,
            model
          });
          console.log('[CHAT] Created chat in DB:', chatId);
        } else {
          resolvedWorkspaceId = existingChat.workspaceId;
          // Load existing session from DB (convert null to undefined)
          existingSessionId = existingChat.sessionId ?? undefined;
          existingSessionProvider = existingChat.sessionProvider;
          console.log('[CHAT] Found existing chat, workspace:', resolvedWorkspaceId);
          if (existingSessionId) {
            console.log('[CHAT] Existing sessionId from DB:', existingSessionId);
          }
        }
      }
    }

    // Build full context with conversation history
    console.log('[CHAT] Building context for chat:', dbChatId, 'workspace:', resolvedWorkspaceId || '(new)');
    
    const contextResult = await buildFullContext(
      resolvedWorkspaceId,
      dbChatId,
      message,
      db,
      { maxMessages: 20 }
    );
    
    console.log('[CHAT] Context built:', {
      hasSystemPrompt: !!contextResult.systemPrompt,
      messageCount: contextResult.messages.length,
      workspaceId: contextResult.workspaceId
    });

    // Get or create workspace-scoped Composio session
    // This ensures integrations are isolated per workspace
    let mcpServers: Record<string, { type: string; url: string; headers: Record<string, string> }> = {};
    
    if (resolvedWorkspaceId) {
      try {
        const workspaceSession = await getOrCreateWorkspaceSession(resolvedWorkspaceId, userId);
        if (workspaceSession) {
          mcpServers = {
            composio: {
              type: 'http',
              url: workspaceSession.mcp.url,
              headers: workspaceSession.mcp.headers
            }
          };
          console.log('[CHAT] Using workspace-scoped Composio session for:', resolvedWorkspaceId);
        }
      } catch (sessionErr) {
        console.error('[CHAT] Failed to create workspace session:', (sessionErr as Error).message);
      }
    } else if (defaultComposioSession) {
      mcpServers = {
        composio: {
          type: 'http',
          url: defaultComposioSession.mcp.url,
          headers: defaultComposioSession.mcp.headers
        }
      };
    }

    // Save user message to database (for conversation history)
    if (dbChatId) {
      try {
        await db.insert(schema.messages).values({
          chatId: dbChatId,
          role: 'user',
          content: message
        });
        console.log('[CHAT] Saved user message to database');
      } catch (msgError) {
        console.error('[CHAT] Error saving user message:', msgError);
        // Continue even if save fails
      }
    }

    // Collect assistant response for saving
    let assistantResponse = '';
    
    // Collect tool calls for persistence
    let messageToolCalls: Array<{
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: string;
      result?: unknown;
    }> = [];

    // Stream responses from the provider
    try {
      for await (const chunk of provider.query({
        prompt: message,  // Original message for providers that don't support history
        messages: contextResult.messages,  // Full conversation history
        systemPrompt: contextResult.systemPrompt ?? undefined,  // System context from workspace (convert null to undefined)
        chatId: dbChatId ?? undefined,  // Use the proper UUID for session management
        sessionId: existingSessionId,  // Pass existing session from DB (for resumption)
        userId,
        mcpServers,
        model: model ?? undefined,  // Convert null to undefined
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'TodoWrite', 'Skill'],
        maxTurns: 100
      })) {
        // Capture session_init and save sessionId to DB
        if (chunk.type === 'session_init' && chunk.session_id && dbChatId) {
          console.log('[CHAT] Session initialized:', chunk.session_id, 'provider:', providerName);
          try {
            await db.update(schema.chats)
              .set({ 
                sessionId: chunk.session_id, 
                sessionProvider: providerName,
                updatedAt: new Date() 
              })
              .where(eq(schema.chats.id, dbChatId));
            console.log('[CHAT] Saved sessionId to database');
          } catch (dbError) {
            console.error('[CHAT] Error saving sessionId:', dbError);
          }
        }
        
        if (chunk.type === 'tool_use') {
          console.log('[SSE] Sending tool_use:', chunk.name);
          // Collect tool call for persistence
          messageToolCalls.push({
            id: chunk.id || crypto.randomUUID(),
            name: chunk.name || '',
            input: (chunk.input as Record<string, unknown>) || {},
            status: 'running',
          });
        }
        
        if (chunk.type === 'tool_result') {
          console.log('[SSE] Sending tool_result for:', chunk.tool_use_id);
          // Update tool call status (success if result exists, error otherwise)
          const toolCall = messageToolCalls.find(t => t.id === chunk.tool_use_id);
          if (toolCall) {
            // If there's a result, it's success; otherwise error
            toolCall.status = chunk.result !== undefined ? 'success' : 'error';
            toolCall.result = chunk.result;
          }
        }
        
        if (chunk.type === 'text') {
          console.log('[SSE] Sending text chunk, length:', chunk.content?.length || 0);
          assistantResponse += chunk.content || '';
        }
        // Send chunk as SSE
        const data = `data: ${JSON.stringify(chunk)}\n\n`;
        res.write(data);
      }
    } catch (streamError: unknown) {
      // Don't send error for user-initiated aborts
      if ((streamError as Error).name === 'AbortError' ||
          (streamError as Error).message?.includes('abort')) {
        console.log('[CHAT] Stream aborted by user');
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'aborted', provider: providerName })}\n\n`);
        }
      } else {
        console.error('[CHAT] Stream error during iteration:', streamError);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: (streamError as Error).message })}\n\n`);
        }
      }
    }

    // Save assistant response to database (with tool calls in metadata)
    if (dbChatId && assistantResponse) {
      try {
        await db.insert(schema.messages).values({
          chatId: dbChatId,
          role: 'assistant',
          content: assistantResponse,
          metadata: messageToolCalls.length > 0
            ? { inlineToolCalls: messageToolCalls }
            : {}
        });
        console.log('[CHAT] Saved assistant response to database with', messageToolCalls.length, 'tool calls');
      } catch (msgError) {
        console.error('[CHAT] Error saving assistant message:', msgError);
      }

      // Generate title after first exchange (2 messages: user + assistant)
      try {
        const messageCount = await db.select({ count: sql`count(*)` })
          .from(schema.messages)
          .where(eq(schema.messages.chatId, dbChatId));

        if (messageCount[0].count === 2) {
          console.log('[CHAT] First exchange complete, generating title...');

          generateConversationTitle({
            userMessage: message,
            assistantResponse,
            provider: providerName as Provider,
            model: model ?? undefined,
          }).then(async (title) => {
            // Update chat title in database
            await db.update(schema.chats)
              .set({ title, updatedAt: new Date() })
              .where(eq(schema.chats.id, dbChatId));

            console.log('[CHAT] Title generated:', title);

            // Emit title update via SSE if connection is still open
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({
                type: 'title_update',
                title
              })}\n\n`);
            }
          }).catch((err) => {
            console.error('[CHAT] Title generation failed:', err);
          });
        }
      } catch (titleGenError) {
        console.error('[CHAT] Error checking message count for title gen:', titleGenError);
      }
    }

    clearInterval(heartbeatInterval);
    if (!res.writableEnded) {
      res.end();
    }
    console.log('[CHAT] Stream completed');
  } catch (error: unknown) {
    clearInterval(heartbeatInterval);

    // Check if this is a user-initiated abort
    if ((error as Error).name === 'AbortError' ||
        (error as Error).message?.includes('abort')) {
      console.log('[CHAT] Request aborted by user');
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'aborted', provider: providerName })}\n\n`);
        res.end();
      }
    } else {
      console.error('[CHAT] Error:', error);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: (error as Error).message })}\n\n`);
        res.end();
      }
    }
  }
});

// Abort endpoint to stop active queries
app.post('/api/abort', (req, res) => {
  const { chatId, provider: providerName = 'claude' } = req.body;

  if (!chatId) {
    return res.status(400).json({ error: 'chatId is required' });
  }

  console.log('[ABORT] Request to abort chatId:', chatId, 'provider:', providerName);

  try {
    const provider = getProvider(providerName);
    const aborted = provider.abort(chatId);

    if (aborted) {
      console.log('[ABORT] Successfully aborted chatId:', chatId);
      res.json({ success: true, message: 'Query aborted' });
    } else {
      console.log('[ABORT] No active query found for chatId:', chatId);
      res.json({ success: false, message: 'No active query to abort' });
    }
  } catch (error: unknown) {
    console.error('[ABORT] Error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get available providers endpoint
app.get('/api/providers', (_req, res) => {
  res.json({
    providers: getAvailableProviders(),
    default: 'claude'
  });
});

// ============================================
// DATABASE INITIALIZATION
// ============================================

// Composio sessions keyed by workspace ID (for isolation)
const composioSessions = new Map<string, { mcp: { url: string; headers: Record<string, string> } }>();
let defaultComposioSession: { mcp: { url: string; headers: Record<string, string> } } | null = null;
let composioClient: Composio | null = null;

function getComposioClient(): Composio {
  if (!composioClient) {
    composioClient = new Composio();
  }
  return composioClient;
}

async function initializeComposioSession() {
  console.log('[COMPOSIO] Pre-initializing default session...');
  try {
    const composio = getComposioClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await composio.create('default-user') as any;
    defaultComposioSession = {
      mcp: {
        url: session.mcp?.url || '',
        headers: session.mcp?.headers || {}
      }
    };
    console.log('[COMPOSIO] Default session ready with MCP URL:', defaultComposioSession.mcp.url);

    // Update opencode.json with the MCP config
    updateOpencodeConfig(defaultComposioSession.mcp.url, defaultComposioSession.mcp.headers);
    console.log('[OPENCODE] Updated opencode.json with MCP config');
  } catch (error) {
    console.error('[COMPOSIO] Failed to pre-initialize session:', (error as Error).message);
  }
}

/**
 * Get or create a Composio session for a specific workspace
 * This ensures integrations are isolated per workspace
 */
async function getOrCreateWorkspaceSession(workspaceId: string, userId: string) {
  // Check for cached session
  const cached = composioSessions.get(workspaceId);
  if (cached) {
    return cached;
  }
  
  // Create workspace-specific entity ID for isolation
  const entityId = `ws_${workspaceId}_user_${userId}`;
  console.log('[COMPOSIO] Creating session for entity:', entityId);
  
  try {
    const composio = getComposioClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await composio.create(entityId, { manageConnections: true }) as any;
    
    const workspaceSession = {
      mcp: {
        url: session.mcp?.url || '',
        headers: session.mcp?.headers || {}
      }
    };
    
    // Cache the session
    composioSessions.set(workspaceId, workspaceSession);
    console.log('[COMPOSIO] Created workspace session, MCP URL:', workspaceSession.mcp.url);
    
    return workspaceSession;
  } catch (error) {
    console.error('[COMPOSIO] Failed to create workspace session:', (error as Error).message);
    // Fallback to default session
    return defaultComposioSession;
  }
}

function updateOpencodeConfig(mcpUrl: string, mcpHeaders: Record<string, string>) {
  const opencodeConfigPath = path.join(__dirname, 'opencode.json');
  const config = {
    mcp: {
      composio: {
        type: 'remote',
        url: mcpUrl,
        headers: mcpHeaders
      }
    }
  };
  fs.writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2));
}

async function getComposioSession(_userId: string) {
  return { composioSessions, defaultComposioSession, updateOpencodeConfig, getOrCreateWorkspaceSession };
}

async function startServer() {
  try {
    // Initialize database
    console.log('[DB] Connecting to database...');
    await initializeDatabase();

    // Setup vector support for embeddings
    await setupVectorSupport();
    console.log('[DB] Database initialized');

    // Initialize providers
    await initializeProviders();

    // Initialize Composio session
    await initializeComposioSession();

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`\n✓ Backend server running on http://localhost:${PORT}`);
      console.log(`✓ Health check: GET http://localhost:${PORT}/api/health`);
      console.log(`✓ Auth: POST http://localhost:${PORT}/api/auth/register`);
      console.log(`✓ Auth: POST http://localhost:${PORT}/api/auth/login`);
      console.log(`✓ Workspaces: http://localhost:${PORT}/api/workspaces`);
      console.log(`✓ Chats: http://localhost:${PORT}/api/chats`);
      console.log(`✓ Available providers: ${getAvailableProviders().join(', ')}\n`);
    });

    // Keep the process alive
    server.on('error', (err) => {
      console.error('Server error:', err);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down server...');
      server.close(async () => {
        await closeDb();
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('[STARTUP] Error:', error);
    process.exit(1);
  }
}

startServer();