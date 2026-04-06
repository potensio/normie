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
  verifyIntegrationModifyAccess,
  type ConnectInput
} from '../services/integration.service.js';

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

  await disconnectToolkit(getDb(), workspaceId, toolkitSlug);
  res.json({ success: true });
}));

export default router;