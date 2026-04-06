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
import { getAvailableProviders, initializeProviders } from './providers/index.js';
import { getDb, closeDb } from './db/index.js';
import { initializeDatabase, setupVectorSupport } from './db/init.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import chatRoutes from './routes/chats.js';
import apiKeyRoutes from './routes/api-keys.js';
import memoryRoutes from './routes/memories.js';
import integrationRoutes from './routes/integrations.js';
import * as schema from './db/schema.js';
import { eq } from 'drizzle-orm';
import { initializePiAgent, getEnabledProviders } from './pi/index.js';
import { loadPiConfig } from './pi/config.js';
import { getProviders, getModels } from '@mariozechner/pi-ai';
import type { PiProviderInfo, PiModel } from '@normie/types';
import { errorHandler, notFoundHandler } from './middleware/index.js';

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
      providers: getAvailableProviders(),
      piProviders: getEnabledProviders()
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
// LEGACY CHAT ENDPOINT (deprecated - use Pi Agent instead)
// ============================================
app.post('/api/chat', async (_req, res) => {
  res.status(410).json({
    error: 'Endpoint deprecated',
    message: 'The legacy /api/chat endpoint has been removed. Please use the Pi Agent-based chat implementation.',
    migration: 'See apps/server/src/pi/ for the new implementation.'
  });
});

// Abort endpoint (deprecated)
app.post('/api/abort', async (_req, res) => {
  res.status(410).json({
    error: 'Endpoint deprecated',
    message: 'The legacy /api/abort endpoint has been removed. Please use the Pi Agent-based implementation.'
  });
});

// ============================================
// PROVIDERS ENDPOINT
// ============================================

// Get available providers with their models
app.get('/api/providers', (_req, res) => {
  const config = loadPiConfig();
  const enabledProviderIds = config.enabledProviders;
  const allProviders = getProviders();
  
  // Build provider info for enabled providers only
  const providers: PiProviderInfo[] = enabledProviderIds
    .filter(providerId => allProviders.includes(providerId as any))
    .map(providerId => {
      let models: PiModel[] = [];
      
      try {
        const providerModels = getModels(providerId as any);
        models = providerModels.map(m => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          contextWindow: m.contextWindow,
          maxTokens: m.maxTokens,
          reasoning: m.reasoning,
          cost: m.cost ? {
            input: m.cost.input,
            output: m.cost.output,
          } : undefined,
        }));
      } catch (e) {
        console.warn(`[Providers] Could not get models for ${providerId}:`, (e as Error).message);
      }
      
      // Format provider name nicely
      const name = providerId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      return {
        id: providerId,
        name,
        models,
      };
    });
  
  res.json({
    providers,
    default: {
      provider: config.defaultProvider,
      model: config.defaultModel,
    },
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler for unknown routes (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

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

// Export for use by other modules
export { getOrCreateWorkspaceSession, getComposioClient, defaultComposioSession };

async function startServer() {
  try {
    // Initialize database
    console.log('[DB] Connecting to database...');
    await initializeDatabase();

    // Setup vector support for embeddings
    await setupVectorSupport();
    console.log('[DB] Database initialized');

    // Initialize providers (legacy - no-op now)
    await initializeProviders();

    // Initialize Composio session
    await initializeComposioSession();

    // Initialize Pi Agent
    await initializePiAgent();

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`\n✓ Backend server running on http://localhost:${PORT}`);
      console.log(`✓ Health check: GET http://localhost:${PORT}/api/health`);
      console.log(`✓ Auth: POST http://localhost:${PORT}/api/auth/register`);
      console.log(`✓ Auth: POST http://localhost:${PORT}/api/auth/login`);
      console.log(`✓ Workspaces: http://localhost:${PORT}/api/workspaces`);
      console.log(`✓ Chats: http://localhost:${PORT}/api/chats`);
      console.log(`✓ Pi Agent providers: ${getEnabledProviders().join(', ')}\n`);
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
