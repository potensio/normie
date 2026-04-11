/**
 * Pi Agent Main Module
 *
 * Provides initialization for Pi Agent on server startup.
 *
 * Architecture:
 * - All message processing uses runPiQueryStream in stream.ts (streaming via SSE)
 * - Non-streaming endpoint has been removed
 */

import { loadPiConfig, validatePiConfig } from "./config.js";
import { BEDROCK_MODELS } from "./bedrock-models.js";

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
  if (process.env.BEDROCK_API_KEY && process.env.BEDROCK_BASE_URL) {
    console.log("[PiAgent] AWS Bedrock configured:");
    console.log(`  API Key: ***${process.env.BEDROCK_API_KEY.slice(-8)}`);
    console.log(`  Base URL: ${process.env.BEDROCK_BASE_URL}`);
    console.log(`  Models: ${BEDROCK_MODELS.length}`);
  } else {
    console.log(
      "[PiAgent] AWS Bedrock: Not configured (need BEDROCK_API_KEY and BEDROCK_BASE_URL)",
    );
  }

  console.log("[PiAgent] Initialized successfully");
}

// Re-export config functions
export {
  loadPiConfig,
  validatePiConfig,
  getEnabledProviders,
} from "./config.js";

// Re-export tools
export { buildWorkspaceTools, type ToolBuilderOptions } from "./tools/index.js";

// Re-export credentials
export { resolveCredentials, type ResolvedCredentials } from "./credentials.js";
