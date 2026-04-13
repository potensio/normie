/**
 * Composio Client Integration
 *
 * Provides a singleton Composio client for the application.
 * Handles authentication, tool discovery, and connected account management.
 *
 * @see https://docs.composio.dev for API reference
 */

import ComposioClient from "@composio/client";

let composioClient: ComposioClient | null = null;

/**
 * Check if Composio is configured
 */
export function isComposioConfigured(): boolean {
  return !!process.env.COMPOSIO_API_KEY;
}

/**
 * Get the Composio client singleton
 */
export function getComposioClient(): ComposioClient {
  if (!composioClient) {
    if (!process.env.COMPOSIO_API_KEY) {
      throw new Error("COMPOSIO_API_KEY not configured");
    }

    composioClient = new ComposioClient({
      apiKey: process.env.COMPOSIO_API_KEY,
    });
  }

  return composioClient;
}

/**
 * Initialize Composio client (call on server startup)
 */
export async function initializeComposio(): Promise<void> {
  if (!isComposioConfigured()) {
    console.log("[Composio] Not configured - skipping initialization");
    return;
  }

  try {
    const client = getComposioClient();
    console.log("[Composio] Client initialized successfully");
    console.log("[Composio] API Key: ***" + process.env.COMPOSIO_API_KEY!.slice(-8));
  } catch (error) {
    console.error("[Composio] Failed to initialize:", error);
  }
}