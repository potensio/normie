/**
 * Integration Routes
 * 
 * Thin HTTP layer that delegates to integration service.
 * All business logic is in services/integration.service.ts
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireWorkspaceAccess } from '../auth/index.js';
import { getDb } from '../db/index.js';
import { asyncHandler } from '../middleware/index.js';
import {
  listToolkits,
  listWorkspaceIntegrations,
  connectToolkit,
  getConnectionStatus,
  disconnectToolkit,
  disconnectToolkitWithTracking,
  verifyIntegrationModifyAccess,
  type ConnectInput
} from '../services/integration.service.js';
import { getActiveSessionTracker } from '../services/active-session-tracker.service.js';

type RequestWithSession = Request & { userId?: string; workspaceRole?: string | null };

const router = Router();

router.use(requireAuth);

// ============================================
// Helper
// ============================================

function getStringParam(value: string | string[] | undefined): string {
  if (!value) return '';
  if (Array.isArray(value)) return value[0] || '';
  return value;
}

// ============================================
// LIST AVAILABLE TOOLKITS
// ============================================
router.get('/toolkits', asyncHandler(async (_req: Request, res: Response) => {
  const toolkits = await listToolkits();
  res.json({ toolkits });
}));

// ============================================
// LIST WORKSPACE INTEGRATIONS
// ============================================
router.get('/:workspaceId', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = getStringParam(req.params.workspaceId);
  const integrations = await listWorkspaceIntegrations(getDb(), workspaceId);
  res.json({ integrations });
}));

// ============================================
// INITIATE CONNECTION (Get auth URL)
// ============================================
router.post('/:workspaceId/connect', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = getStringParam(req.params.workspaceId);
  
  const input: ConnectInput = {
    toolkitSlug: req.body.toolkitSlug,
    redirectUrl: req.body.redirectUrl
  };

  const result = await connectToolkit(getDb(), workspaceId, req.userId!, input);
  res.json(result);
}));

// ============================================
// CHECK CONNECTION STATUS
// ============================================
router.get('/:workspaceId/status/:toolkitSlug', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = getStringParam(req.params.workspaceId);
  const toolkitSlug = getStringParam(req.params.toolkitSlug);

  const status = await getConnectionStatus(getDb(), workspaceId, toolkitSlug);
  res.json(status);
}));

// ============================================
// DISCONNECT INTEGRATION
// ============================================
router.delete('/:workspaceId/:toolkitSlug', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  // Only owner and admin can disconnect
  verifyIntegrationModifyAccess(req.workspaceRole ?? null);

  const workspaceId = getStringParam(req.params.workspaceId);
  const toolkitSlug = getStringParam(req.params.toolkitSlug);
  const force = req.query.force === 'true';

  const sessionTracker = getActiveSessionTracker();

  // Use enhanced disconnect with session tracking
  const result = await disconnectToolkitWithTracking(
    getDb(),
    {
      workspaceId,
      toolkitSlug,
      userId: (req as RequestWithSession).userId || '',
      force,
    },
    sessionTracker
  );

  if (result.warning) {
    // Active sessions exist and not forced
    res.status(409).json({
      success: false,
      error: 'Active sessions using this toolkit',
      warning: result.warning,
      message: `This toolkit is in use by ${result.warning.activeSessionCount} active session(s). Use force=true to disconnect anyway.`,
    });
    return;
  }

  if (result.error) {
    res.status(500).json({
      success: false,
      error: result.error,
    });
    return;
  }

  res.json({
    success: true,
    toolkitSlug,
    composioDeleted: result.composioDeleted,
    dbDeleted: result.dbDeleted,
  });
}));

export default router;