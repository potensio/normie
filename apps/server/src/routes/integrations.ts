import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { Composio } from '@composio/core';
import { requireAuth, requireWorkspaceAccess } from '../auth/index.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';

const router = Router();

// All integration routes require auth
router.use(requireAuth);

// Composio client singleton
let composioInstance: Composio | null = null;

function getComposio(): Composio {
  if (!composioInstance) {
    composioInstance = new Composio();
  }
  return composioInstance;
}

// ============================================
// LIST AVAILABLE TOOLKITS
// ============================================
router.get('/toolkits', async (_req: Request, res: Response) => {
  try {
    const composio = getComposio();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolkits = await (composio.toolkits as any).list();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = toolkits.items || toolkits || [];
    
    res.json({ 
      toolkits: items.map((t: any) => ({
        slug: t.slug,
        name: t.name,
        description: t.description,
        logo: t.logo,
        categories: t.categories
      }))
    });
  } catch (err) {
    console.error('[INTEGRATIONS] List toolkits error:', err);
    res.status(500).json({ error: 'Failed to list toolkits' });
  }
});

// ============================================
// LIST WORKSPACE INTEGRATIONS
// ============================================
router.get('/:workspaceId', requireWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = Array.isArray(req.params.workspaceId) ? req.params.workspaceId[0] : req.params.workspaceId;
    const db = getDb();
    
    const integrations = await db.select()
      .from(schema.workspaceIntegrations)
      .where(eq(schema.workspaceIntegrations.workspaceId, workspaceId));

    res.json({ integrations });
  } catch (err) {
    console.error('[INTEGRATIONS] List error:', err);
    res.status(500).json({ error: 'Failed to list integrations' });
  }
});

// ============================================
// INITIATE CONNECTION (Get auth URL)
// ============================================
router.post('/:workspaceId/connect', requireWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = Array.isArray(req.params.workspaceId) ? req.params.workspaceId[0] : req.params.workspaceId;
    const { toolkitSlug, redirectUrl } = req.body;
    
    if (!toolkitSlug) {
      return res.status(400).json({ error: 'toolkitSlug is required' });
    }

    const composio = getComposio();
    
    // Create workspace-specific entity ID for isolation
    const entityId = `ws_${workspaceId}_user_${req.userId}`;
    
    // Get or create auth config for the toolkit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authConfigs = await (composio.authConfigs as any).list({ toolkit: toolkitSlug });
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authConfigId = authConfigs.items?.[0]?.id;
    
    // Create connected account link with workspace-scoped entity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connection = await (composio.connectedAccounts as any).create({
      auth_config: { id: authConfigId || '' },
      connection: {
        params: {
          redirect_uri: redirectUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/integrations/callback`
        }
      },
      user_id: entityId
    });

    const db = getDb();
    
    // Store integration in database
    await db.insert(schema.workspaceIntegrations)
      .values({
        workspaceId,
        toolkitSlug,
        connectedAccountId: connection.id,
        connectionStatus: connection.status || 'PENDING',
        createdBy: req.userId!,
        metadata: {
          entityId,
          connectedAt: new Date().toISOString()
        }
      })
      .onConflictDoUpdate({
        target: [schema.workspaceIntegrations.workspaceId, schema.workspaceIntegrations.toolkitSlug],
        set: {
          connectedAccountId: connection.id,
          connectionStatus: connection.status || 'PENDING',
          updatedAt: new Date()
        }
      });

    res.json({
      connectedAccountId: connection.id,
      redirectUrl: connection.redirect_url || connection.redirect_uri,
      status: connection.status
    });
  } catch (err) {
    console.error('[INTEGRATIONS] Connect error:', err);
    res.status(500).json({ error: 'Failed to initiate connection', details: (err as Error).message });
  }
});

// ============================================
// CHECK CONNECTION STATUS
// ============================================
router.get('/:workspaceId/status/:toolkitSlug', requireWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = Array.isArray(req.params.workspaceId) ? req.params.workspaceId[0] : req.params.workspaceId;
    const toolkitSlug = Array.isArray(req.params.toolkitSlug) ? req.params.toolkitSlug[0] : req.params.toolkitSlug;
    const db = getDb();
    
    const [integration] = await db.select()
      .from(schema.workspaceIntegrations)
      .where(and(
        eq(schema.workspaceIntegrations.workspaceId, workspaceId),
        eq(schema.workspaceIntegrations.toolkitSlug, toolkitSlug)
      ));

    if (!integration) {
      return res.json({ connected: false, status: 'NOT_CONNECTED' });
    }

    // Get fresh status from Composio
    const composio = getComposio();
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = await (composio.connectedAccounts as any).retrieve(integration.connectedAccountId);
      
      // Update status in database if changed
      const newStatus = account.status || 'UNKNOWN';
      if (newStatus !== integration.connectionStatus) {
        await db.update(schema.workspaceIntegrations)
          .set({ 
            connectionStatus: newStatus,
            updatedAt: new Date()
          })
          .where(eq(schema.workspaceIntegrations.id, integration.id));
      }
      
      res.json({
        connected: account.status === 'ACTIVE',
        status: account.status,
        connectedAccountId: integration.connectedAccountId,
        toolkitSlug: integration.toolkitSlug
      });
    } catch (retrieveError) {
      console.error('[INTEGRATIONS] Retrieve error:', retrieveError);
      res.json({
        connected: false,
        status: integration.connectionStatus,
        connectedAccountId: integration.connectedAccountId
      });
    }
  } catch (err) {
    console.error('[INTEGRATIONS] Status check error:', err);
    res.status(500).json({ error: 'Failed to check connection status' });
  }
});

// ============================================
// DISCONNECT INTEGRATION
// ============================================
router.delete('/:workspaceId/:toolkitSlug', requireWorkspaceAccess, async (req: Request, res: Response) => {
  // Only owner and admin can disconnect
  if (req.workspaceRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot disconnect integrations' });
  }

  try {
    const workspaceId = Array.isArray(req.params.workspaceId) ? req.params.workspaceId[0] : req.params.workspaceId;
    const toolkitSlug = Array.isArray(req.params.toolkitSlug) ? req.params.toolkitSlug[0] : req.params.toolkitSlug;
    const db = getDb();
    
    const [integration] = await db.select()
      .from(schema.workspaceIntegrations)
      .where(and(
        eq(schema.workspaceIntegrations.workspaceId, workspaceId),
        eq(schema.workspaceIntegrations.toolkitSlug, toolkitSlug)
      ));

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Delete from Composio
    try {
      const composio = getComposio();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (composio.connectedAccounts as any).delete(integration.connectedAccountId);
    } catch (deleteError) {
      console.error('[INTEGRATIONS] Composio delete error:', deleteError);
      // Continue to delete from our DB even if Composio delete fails
    }

    // Delete from database
    await db.delete(schema.workspaceIntegrations)
      .where(eq(schema.workspaceIntegrations.id, integration.id));

    res.json({ success: true });
  } catch (err) {
    console.error('[INTEGRATIONS] Disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect integration' });
  }
});

export default router;