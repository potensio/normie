/**
 * Composio Integration Routes
 *
 * Provides API endpoints for:
 * - Listing available toolkits
 * - Checking connection status
 * - Initiating OAuth flows
 * - Managing connected accounts
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth/index.js";
import { asyncHandler } from "../middleware/index.js";
import {
  isComposioConfigured,
  listAvailableToolkits,
  checkConnectedAccount,
  initiateConnection,
  waitForConnection,
  disconnectAccount,
  listUserConnections,
  invalidateConnectionCache,
} from "../pi/composio/index.js";

const router = Router();

/**
 * OAuth Callback endpoint (PUBLIC - no auth required)
 *
 * This is where Composio redirects after user authenticates.
 * Must be placed BEFORE the requireAuth middleware.
 */
router.get(
  "/callback",
  asyncHandler(async (req: Request, res: Response) => {
    const { error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error("[Composio] OAuth error:", error, error_description);
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      res.redirect(
        `${frontendUrl}/settings/integrations?error=${encodeURIComponent(getStringParam(error as string))}`
      );
      return;
    }

    // Success - invalidate all connection caches since we don't know which workspace connected
    // This ensures fresh data on next tool execution
    invalidateConnectionCache("all");
    console.log("[Composio] OAuth callback successful, cache cleared");
    
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/settings/integrations?connected=success`);
  }),
);

// All routes below require authentication
router.use(requireAuth);

/**
 * Helper to get string param (handles string[] case)
 */
function getStringParam(value: string | string[] | undefined): string {
  if (!value) return "";
  if (Array.isArray(value)) return value[0] || "";
  return value;
}

/**
 * Check if Composio is configured
 */
router.get(
  "/status",
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      configured: isComposioConfigured(),
    });
  }),
);

/**
 * List available Composio toolkits
 */
router.get(
  "/toolkits",
  asyncHandler(async (req: Request, res: Response) => {
    if (!isComposioConfigured()) {
      res.json({ toolkits: [], error: "Composio not configured" });
      return;
    }

    const toolkits = await listAvailableToolkits();
    res.json({ toolkits });
  }),
);

/**
 * List user's connected accounts
 */
router.get(
  "/connections",
  asyncHandler(async (req: Request, res: Response) => {
    if (!isComposioConfigured()) {
      res.json({ connections: [], error: "Composio not configured" });
      return;
    }

    const connections = await listUserConnections(req.userId!);
    res.json({ connections });
  }),
);

/**
 * Check connection status for a specific toolkit
 */
router.get(
  "/connections/:toolkitSlug",
  asyncHandler(async (req: Request, res: Response) => {
    const toolkitSlug = getStringParam(req.params.toolkitSlug);

    if (!isComposioConfigured()) {
      res.json({
        connected: false,
        toolkitSlug,
        error: "Composio not configured",
      });
      return;
    }

    const status = await checkConnectedAccount(req.userId!, toolkitSlug);
    res.json(status);
  }),
);

/**
 * Initiate OAuth connection for a toolkit
 *
 * Returns an auth URL that the client can open in a popup/iframe.
 */
router.post(
  "/connect/:toolkitSlug",
  asyncHandler(async (req: Request, res: Response) => {
    const toolkitSlug = getStringParam(req.params.toolkitSlug);
    const { callbackUrl } = req.body;

    if (!isComposioConfigured()) {
      res.status(400).json({
        error: "Composio not configured",
        message: "Set COMPOSIO_API_KEY to enable integrations",
      });
      return;
    }

    // Check if already connected
    const status = await checkConnectedAccount(req.userId!, toolkitSlug);
    if (status.connected) {
      res.json({
        connected: true,
        message: `Already connected to ${toolkitSlug}`,
        connectedAccountId: status.connectedAccountId,
      });
      return;
    }

    // Initiate connection
    try {
      const connection = await initiateConnection(req.userId!, toolkitSlug, {
        callbackUrl,
      });

      res.json({
        connected: false,
        connectedAccountId: connection.id,
        authUrl: connection.redirectUrl,
        message: `Please authenticate with ${toolkitSlug}`,
      });
    } catch (error: any) {
      console.error(`[Composio] Failed to initiate connection for ${toolkitSlug}:`, error);
      res.status(500).json({
        error: "Connection failed",
        message: error.message || "Failed to initiate connection",
      });
    }
  }),
);

/**
 * Wait for connection completion
 *
 * Polls until the user completes OAuth or timeout.
 */
router.post(
  "/connections/:connectedAccountId/wait",
  asyncHandler(async (req: Request, res: Response) => {
    const connectedAccountId = getStringParam(req.params.connectedAccountId);
    const { timeoutMs = 120000 } = req.body;

    if (!isComposioConfigured()) {
      res.status(400).json({
        error: "Composio not configured",
      });
      return;
    }

    const result = await waitForConnection(connectedAccountId, timeoutMs);

    if (result.connected) {
      res.json({
        connected: true,
        connectedAccountId: result.connectedAccountId,
      });
    } else {
      res.json({
        connected: false,
        error: result.error,
      });
    }
  }),
);

/**
 * Disconnect a connected account
 */
router.delete(
  "/connections/:connectedAccountId",
  asyncHandler(async (req: Request, res: Response) => {
    const connectedAccountId = getStringParam(req.params.connectedAccountId);

    if (!isComposioConfigured()) {
      res.status(400).json({
        error: "Composio not configured",
      });
      return;
    }

    try {
      await disconnectAccount(connectedAccountId);
      res.json({ success: true });
    } catch (error: any) {
      console.error(`[Composio] Failed to disconnect ${connectedAccountId}:`, error);
      res.status(500).json({
        error: "Disconnect failed",
        message: error.message,
      });
    }
  }),
);

export default router;