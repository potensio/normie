/**
 * Composio Integration
 *
 * Provides autonomous tool discovery and execution via Composio.
 *
 * ## How It Works
 *
 * 1. **AI searches for tools** using natural language:
 *    ```
 *    composio_search_tools("star a github repo")
 *    → Returns: GITHUB_STAR_A_REPOSITORY
 *    ```
 *
 * 2. **AI executes the tool**:
 *    ```
 *    composio_execute_tool("GITHUB_STAR_A_REPOSITORY", { owner: "composiohq", repo: "composio" })
 *    ```
 *
 * 3. **If user hasn't connected**:
 *    → AI receives auth URL
 *    → User visits URL, connects account
 *    → AI retries execution
 *
 * ## Setup
 *
 * Set COMPOSIO_API_KEY in your environment.
 * Get your API key at https://app.composio.dev
 */

export { getComposioClient, isComposioConfigured } from "./client.js";

export {
  checkConnectedAccount,
  initiateConnection,
  waitForConnection,
  disconnectAccount,
  listUserConnections,
  type ConnectionRequest,
  type ConnectedAccountStatus,
} from "./connected-accounts.js";

export {
  searchComposioTools,
  executeComposioTool,
  getComposioMetaTools,
  listAvailableToolkits,
  invalidateConnectionCache,
} from "./tools.js";