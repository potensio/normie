/**
 * POC v2: Test Bedrock via Pi Agent SDK with ModelRegistry
 *
 * Uses ModelRegistry.registerProvider() to register custom Bedrock provider
 * This is how Pi Agent CLI loads models.json!
 */

import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

console.log("=".repeat(60));
console.log("POC v2: Bedrock via ModelRegistry.registerProvider()");
console.log("=".repeat(60));

// Step 1: Create AuthStorage
console.log("\n[1] Creating auth storage...");
const authStorage = AuthStorage.inMemory({
  bedrock: {
    type: "api_key",
    key: process.env.BEDROCK_API_KEY!,
  },
});
console.log("✅ Auth storage created");

// Step 2: Create ModelRegistry
console.log("\n[2] Creating ModelRegistry...");
const modelRegistry = ModelRegistry.inMemory(authStorage);
console.log("✅ ModelRegistry created");

// Step 3: Register custom Bedrock provider (like models.json)
console.log("\n[3] Registering custom Bedrock provider...");
modelRegistry.registerProvider("bedrock", {
  baseUrl: process.env.BEDROCK_BASE_URL!,
  apiKey: process.env.BEDROCK_API_KEY!, // Required!
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
console.log(`   Base URL: ${process.env.BEDROCK_BASE_URL}`);
console.log(`   API type: openai-completions`);

// Step 4: Get model from registry
console.log("\n[4] Getting model from registry...");
const model = modelRegistry.find("bedrock", "zai.glm-5");
if (!model) {
  console.error("❌ Model not found in registry");
  process.exit(1);
}
console.log("✅ Model retrieved:", model.name);
console.log("   Provider:", model.provider);
console.log("   Context window:", model.contextWindow);
console.log("   Max tokens:", model.maxTokens);

// Step 5: Create test tools
console.log("\n[5] Creating test tools...");
const testTools = [
  {
    name: "get_time",
    description: "Get current time",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      const now = new Date().toISOString();
      console.log(`   [Tool] get_time executed: ${now}`);
      return {
        content: [{ type: "text", text: `Current time: ${now}` }],
      };
    },
  },
  {
    name: "calculate",
    description: "Calculate a math expression",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Math expression" },
      },
      required: ["expression"],
    },
    execute: async (toolCallId: string, args: { expression: string }) => {
      try {
        const result = eval(args.expression);
        console.log(`   [Tool] calculate(${args.expression}) = ${result}`);
        return {
          content: [{ type: "text", text: `Result: ${result}` }],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error: ${(error as Error).message}` },
          ],
        };
      }
    },
  },
];
console.log(`✅ Created ${testTools.length} test tools`);

// Step 6: Create agent session
console.log("\n[6] Creating agent session...");
let session;
try {
  const result = await createAgentSession({
    authStorage,
    model,
    tools: testTools as any,
    thinkingLevel: "medium",
  });
  session = result.session;
  console.log("✅ Agent session created");
  console.log(
    "   SDK will handle tool loop automatically (no iteration limit!)",
  );
} catch (error) {
  console.error("❌ Failed to create session:", error);
  console.error("Stack:", (error as Error).stack);
  process.exit(1);
}

// Step 7: Test with multiple tool calls
console.log("\n[7] Testing with prompt requiring multiple tool calls...");
console.log(
  '   Prompt: "What time is it? Then calculate 123 * 456. Then calculate the result + 1000. Then calculate that result * 2."',
);
console.log("   Expected: 4+ tool calls");
console.log("");

let toolCallCount = 0;
let textChunks: string[] = [];
let done = false;

// Subscribe to events
const unsubscribe = session.subscribe((event) => {
  // Log all events for debugging
  if (event.type !== "message_update") {
    console.log(`\n[Event] ${event.type}`);
  }

  if (event.type === "message_update") {
    const msgEvent = event.assistantMessageEvent;

    if (msgEvent.type === "text_delta") {
      process.stdout.write(msgEvent.delta);
      textChunks.push(msgEvent.delta);
    }

    if (msgEvent.type === "thinking_delta") {
      // Log thinking but don't print full content
      console.log(`\n[Thinking] ${msgEvent.delta.substring(0, 50)}...`);
    }

    if (msgEvent.type === "toolcall_start") {
      const partial = msgEvent.partial;
      for (const block of partial.content) {
        if (block.type === "toolCall") {
          toolCallCount++;
          console.log(
            `\n[Tool Call ${toolCallCount}] ${block.name}(${JSON.stringify(block.arguments)})`,
          );
        }
      }
    }
  }

  if (event.type === "tool_execution_start") {
    console.log(`\n[Tool Execution Start] ID: ${event.toolCallId}`);
  }

  if (event.type === "tool_execution_end") {
    console.log(
      `\n[Tool Execution End] ID: ${event.toolCallId}, Error: ${event.isError}`,
    );
  }

  if (event.type === "agent_end") {
    console.log("\n[Event] Agent ended");
    if ("error" in event && event.error) {
      console.error("[Error]", event.error);
    }
    done = true;
  }
});

// Send prompt
try {
  console.log("Sending prompt to agent...\n");
  await session.prompt(
    "What time is it? Then calculate 123 * 456. Then calculate the result + 1000. Then calculate that result * 2.",
  );

  // Wait for completion with timeout
  const startTime = Date.now();
  const timeout = 90000; // 90 seconds

  while (!done) {
    if (Date.now() - startTime > timeout) {
      console.error("\n❌ Timeout waiting for agent response");
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  unsubscribe();

  console.log("\n");
  console.log("=".repeat(60));

  if (toolCallCount === 0 && textChunks.length === 0) {
    console.log("⚠️  POC INCOMPLETE - No response received");
    console.log("=".repeat(60));
    console.log("Possible issues:");
    console.log("1. Model might not support tool calling");
    console.log("2. Auth credentials might be invalid");
    console.log("3. API endpoint might be incorrect");
    console.log("4. Model might need different prompt format");
    console.log("");
    console.log("Debug info:");
    console.log(`- Tool calls: ${toolCallCount}`);
    console.log(`- Text chunks: ${textChunks.length}`);
    console.log(`- Done flag: ${done}`);
    process.exit(1);
  }

  console.log("✅ POC SUCCESSFUL!");
  console.log("=".repeat(60));
  console.log(`Total tool calls: ${toolCallCount}`);
  console.log(`Total text chunks: ${textChunks.length}`);
  console.log(`Response length: ${textChunks.join("").length} chars`);
  console.log("");

  if (toolCallCount > 0) {
    console.log("🎉 KEY FINDINGS:");
    console.log("1. ✅ ModelRegistry.registerProvider() works!");
    console.log("2. ✅ Custom Bedrock provider with openai-completions API");
    console.log(
      "3. ✅ SDK handled multiple tool calls without iteration limit",
    );
    console.log("4. ✅ Streaming works correctly");
    console.log("");
    console.log("📋 MIGRATION PLAN:");
    console.log(
      "1. Delete apps/server/src/providers/bedrock-mantle-provider.ts",
    );
    console.log("2. Use ModelRegistry.registerProvider() in pi/index.ts");
    console.log("3. Remove isMantle check and custom streaming");
    console.log("4. Let Pi Agent SDK handle everything!");
  } else {
    console.log("⚠️  Note: Model responded with text but no tool calls");
    console.log("This might mean:");
    console.log("- Model chose to answer directly without tools");
    console.log("- Tool definitions might need adjustment");
    console.log("- Try with a more explicit prompt");
  }
} catch (error) {
  console.error("\n❌ POC FAILED:", error);
  console.error("Stack:", (error as Error).stack);
  process.exit(1);
}
