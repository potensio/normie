/**
 * Composio + Pi Agent Integration PoC
 *
 * Tests:
 * 1. AI awareness of Composio tools (1,000+ integrations)
 * 2. Proactive OAuth URL generation when connection needed
 * 3. Correct understanding and acknowledgment of user requests
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

import { Composio } from "@composio/core";
import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

// ============================================
// Configuration
// ============================================

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const BEDROCK_API_KEY = process.env.BEDROCK_API_KEY;
const BEDROCK_BASE_URL = process.env.BEDROCK_BASE_URL;

if (!COMPOSIO_API_KEY) {
  console.error("❌ COMPOSIO_API_KEY not found in .env");
  process.exit(1);
}

if (!BEDROCK_API_KEY || !BEDROCK_BASE_URL) {
  console.error("❌ BEDROCK_API_KEY or BEDROCK_BASE_URL not found in .env");
  process.exit(1);
}

// ============================================
// Composio Integration
// ============================================

/**
 * Get Composio tools for specific toolkits.
 * Uses the standard Composio SDK API.
 */
async function getComposioTools(userId: string, toolkits: string[]) {
  console.log(`\n📦 Getting Composio tools for user: ${userId}`);
  console.log(`   Toolkits: ${toolkits.join(", ")}`);

  const composio = new Composio({ apiKey: COMPOSIO_API_KEY });

  // Get tools for the specified toolkits
  const tools = await composio.tools.get(userId, {
    toolkits: toolkits as any,
  });

  console.log(`✅ Retrieved ${tools.length} tools`);

  return { composio, tools };
}

/**
 * Convert Composio tools to Pi Agent format.
 */
async function convertComposioToolsToPiFormat(
  composio: Composio,
  tools: any[],
): Promise<AgentTool[]> {
  console.log("\n🔧 Converting Composio tools to Pi Agent format...");

  console.log(`   Found ${tools.length} tools`);

  // Convert to Pi Agent format
  const piTools: AgentTool[] = tools.map((tool: any) => {
    // Extract parameters schema
    const parameters = tool.function?.parameters || tool.parameters || {};

    // Convert to TypeBox schema (simplified)
    const typeBoxParams = Type.Object(
      Object.entries(parameters.properties || {}).reduce(
        (acc, [key, prop]: [string, any]) => {
          acc[key] = Type.String({ description: prop.description });
          return acc;
        },
        {} as any,
      ),
    );

    const toolName = tool.function?.name || tool.name;

    return {
      name: toolName,
      label: toolName,
      description:
        tool.function?.description || tool.description || `Execute ${toolName}`,
      parameters: typeBoxParams,
      execute: async (toolCallId: string, params: any) => {
        console.log(`\n🔨 Executing tool: ${toolName}`);
        console.log(`   Params:`, JSON.stringify(params, null, 2));

        try {
          // Execute via Composio SDK
          const result = await composio.tools.execute(toolName, params);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
            details: {
              success: true,
              tool: toolName,
            },
          };
        } catch (error: any) {
          console.error(`❌ Tool execution error:`, error);

          return {
            content: [
              {
                type: "text",
                text: `Error executing ${toolName}: ${error.message}`,
              },
            ],
            details: {
              success: false,
              error: error.message,
            },
          };
        }
      },
    };
  });

  console.log(`✅ Converted ${piTools.length} tools`);

  return piTools;
}

/**
 * Create a meta-tool that helps the AI understand available integrations
 * and proactively suggest OAuth connections.
 */
function createComposioAwarenessTool(
  composio: Composio,
  userId: string,
  toolkits: string[],
): AgentTool {
  return {
    name: "composio_get_toolkit_info",
    label: "Get Composio Toolkit Information",
    description: `Get information about available Composio toolkits and their connection status. 
Use this to check if a toolkit is connected before attempting to use its tools.
Composio provides 1,000+ integrations including: GitHub, Gmail, Slack, Google Calendar, Notion, Jira, Linear, and many more.`,
    parameters: Type.Object({
      toolkit: Type.Optional(
        Type.String({
          description:
            'Toolkit slug to check (e.g., "github", "gmail", "slack"). If omitted, lists all available toolkits.',
        }),
      ),
    }),
    execute: async (toolCallId: string, params: any) => {
      console.log(`\n📋 Getting toolkit info for: ${params.toolkit || "all"}`);

      try {
        if (params.toolkit) {
          // Check if toolkit is in our list
          const toolkit = toolkits.find(
            (t) => t.toLowerCase() === params.toolkit.toLowerCase(),
          );

          if (!toolkit) {
            return {
              content: [
                {
                  type: "text",
                  text: `Toolkit "${params.toolkit}" is not currently enabled in this session. Available toolkits: ${toolkits.join(", ")}`,
                },
              ],
              details: { found: false },
            };
          }

          // Check connection status via Composio API
          try {
            const connectedAccounts = await (
              composio as any
            ).connectedAccounts.list({
              user_id: userId,
            });

            const isConnected = connectedAccounts.items?.some(
              (acc: any) =>
                acc.appName?.toLowerCase() === toolkit.toLowerCase() &&
                acc.status === "ACTIVE",
            );

            let message = `**${toolkit}** toolkit\n\n`;

            if (isConnected) {
              message += `✅ Status: Connected and ready to use\n`;
            } else {
              // Generate OAuth URL
              const connection = await (
                composio as any
              ).connectedAccounts.initiate({
                user_id: userId,
                app: toolkit,
              });

              const oauthUrl =
                connection.redirectUrl || connection.redirect_url;

              message += `⚠️ Status: Not connected\n\n`;
              message += `To use ${toolkit}, please connect your account:\n`;
              message += `🔗 [Click here to connect](${oauthUrl})\n\n`;
              message += `Once connected, I'll be able to help you with ${toolkit} tasks.`;
            }

            return {
              content: [
                {
                  type: "text",
                  text: message,
                },
              ],
              details: {
                toolkit,
                connected: isConnected,
              },
            };
          } catch (error: any) {
            // If we can't check status, assume not connected and provide generic message
            return {
              content: [
                {
                  type: "text",
                  text: `**${toolkit}** toolkit is available but not connected. Please connect it in your Composio dashboard to use its tools.`,
                },
              ],
              details: {
                toolkit,
                connected: false,
                error: error.message,
              },
            };
          }
        } else {
          // List all toolkits
          const summary = toolkits.map((t) => `• ${t}`).join("\n");

          return {
            content: [
              {
                type: "text",
                text: `Available Composio toolkits in this session:\n\n${summary}\n\nComposio provides access to 1,000+ integrations. These are the ones currently enabled for you.`,
              },
            ],
            details: {
              count: toolkits.length,
              toolkits,
            },
          };
        }
      } catch (error: any) {
        console.error(`❌ Error getting toolkit info:`, error);

        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
          details: { error: error.message },
        };
      }
    },
  };
}

// ============================================
// Pi Agent Setup
// ============================================

async function createPiAgentWithComposio(userId: string, toolkits: string[]) {
  console.log("\n🤖 Setting up Pi Agent with Composio integration...");

  // Get Composio tools
  const { composio, tools } = await getComposioTools(userId, toolkits);

  // Convert Composio tools to Pi format
  const composioTools = await convertComposioToolsToPiFormat(composio, tools);

  // Add awareness tool
  const awarenessTool = createComposioAwarenessTool(composio, userId, toolkits);

  // Combine all tools
  const allTools = [awarenessTool, ...composioTools];

  console.log(`\n✅ Total tools available: ${allTools.length}`);

  // Create auth storage with Bedrock
  console.log("\n[Auth] Creating auth storage...");
  const authStorage = AuthStorage.inMemory({
    bedrock: {
      type: "api_key",
      key: BEDROCK_API_KEY!,
    },
  });
  console.log("✅ Auth storage created");

  // Create model registry
  console.log("\n[Registry] Creating ModelRegistry...");
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  console.log("✅ ModelRegistry created");

  // Register custom Bedrock provider (like the test-bedrock-sdk-v2.ts)
  console.log("\n[Registry] Registering custom Bedrock provider...");
  modelRegistry.registerProvider("bedrock", {
    baseUrl: BEDROCK_BASE_URL!,
    apiKey: BEDROCK_API_KEY!,
    api: "openai-completions",
    authHeader: true,
    models: [
      {
        id: "zai.glm-5",
        name: "GLM-5",
        api: "openai-completions",
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
      {
        id: "moonshotai.kimi-k2.5",
        name: "Kimi K2.5",
        api: "openai-completions",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  });
  console.log("✅ Custom Bedrock provider registered");
  console.log(`   Base URL: ${BEDROCK_BASE_URL}`);
  console.log(`   API type: openai-completions`);

  // Get model from registry
  console.log("\n[Registry] Getting model from registry...");
  const model = modelRegistry.find("bedrock", "zai.glm-5");

  if (!model) {
    throw new Error("Model not found");
  }
  console.log("✅ Model retrieved:", model.name);
  console.log("   Provider:", model.provider);
  console.log("   Context window:", model.contextWindow);

  // Create agent session
  const { session } = await createAgentSession({
    authStorage,
    model,
    thinkingLevel: "medium",
    tools: allTools as any,
    customTools: [],
  });

  console.log("✅ Pi Agent session created");

  return { session, composio };
}

// ============================================
// Test Scenarios
// ============================================

async function runTest(
  session: any,
  testName: string,
  prompt: string,
): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log(`🧪 TEST: ${testName}`);
  console.log("=".repeat(80));
  console.log(`\n💬 User: ${prompt}\n`);

  let fullResponse = "";
  let toolCalls: any[] = [];

  // Subscribe to events
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      const msgEvent = event as any;

      // Collect text content
      if (msgEvent.assistantMessageEvent?.type === "content_block_delta") {
        const delta = msgEvent.assistantMessageEvent.delta;
        if (delta.type === "text_delta") {
          fullResponse += delta.text;
        }
      }

      // Collect tool calls
      if (msgEvent.assistantMessageEvent?.type === "toolcall_start") {
        toolCalls.push(msgEvent.assistantMessageEvent);
      }
    }

    if (event.type === "tool_execution_start") {
      const toolEvent = event as any;
      console.log(`\n🔧 Tool called: ${toolEvent.toolName}`);
    }

    if (event.type === "tool_execution_end") {
      const toolEvent = event as any;
      if (toolEvent.isError) {
        console.log(`❌ Tool error: ${toolEvent.error}`);
      } else {
        console.log(`✅ Tool completed`);
      }
    }
  });

  try {
    // Send prompt
    await session.prompt(prompt);

    // Wait a bit for processing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Display results
    console.log("\n🤖 Assistant Response:");
    console.log("-".repeat(80));
    console.log(fullResponse || "(No text response)");
    console.log("-".repeat(80));

    if (toolCalls.length > 0) {
      console.log(`\n📊 Tools called: ${toolCalls.length}`);
      toolCalls.forEach((tc, i) => {
        console.log(`   ${i + 1}. ${tc.toolName}`);
      });
    }
  } finally {
    unsubscribe();
  }
}

// ============================================
// Main
// ============================================

async function main() {
  console.log("🚀 Composio + Pi Agent Integration PoC");
  console.log("=".repeat(80));

  try {
    // Setup
    const userId = "test_user_123";
    const toolkits = ["HACKERNEWS"]; // Start with a no-auth toolkit for testing

    const { session, composio } = await createPiAgentWithComposio(
      userId,
      toolkits,
    );

    // Test 1: AI awareness of available tools
    await runTest(
      session,
      "AI Awareness - List Available Integrations",
      "What integrations do you have access to? Can you list them?",
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Test 2: Understanding user intent and using tools
    await runTest(
      session,
      "Intent Understanding - Fetch HackerNews",
      "What are the top stories on Hacker News right now?",
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Test 3: Proactive OAuth URL generation (with GitHub)
    await runTest(
      session,
      "Proactive OAuth - Request GitHub Connection",
      "I want to create a GitHub issue in my repository. Can you help?",
    );

    console.log("\n" + "=".repeat(80));
    console.log("✅ All tests completed!");
    console.log("=".repeat(80));
  } catch (error: any) {
    console.error("\n❌ Test failed:", error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
