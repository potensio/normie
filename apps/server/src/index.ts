import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";

// Load env FIRST before other imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });

// Now import modules that depend on env vars
import {
  getAvailableProviders,
  initializeProviders,
} from "./providers/index.js";
import { getDb, closeDb } from "./db/index.js";
import { initializeDatabase, setupVectorSupport } from "./db/init.js";
import authRoutes from "./routes/auth.js";
import workspaceRoutes from "./routes/workspaces.js";
import chatRoutes from "./routes/chats.js";
import apiKeyRoutes from "./routes/api-keys.js";
import { skillsRouter } from "./routes/skills.js";
import composioRoutes from "./routes/composio.js";
import * as schema from "./db/schema.js";
import { initializePiAgent, getEnabledProviders } from "./pi/index.js";
// Composio integration is initialized on-demand via isComposioConfigured()
import { loadPiConfig } from "./pi/config.js";
import { getProviders, getModels } from "@mariozechner/pi-ai";
import type { PiProviderInfo, PiModel } from "@normie/types";
import { errorHandler, notFoundHandler } from "./middleware/index.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Serve static frontend files
app.use(express.static(path.join(__dirname, "..", "renderer")));

// Middleware - CORS configuration for cookie-based auth
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like Electron app) or from localhost
      if (
        !origin ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin === "null"
      ) {
        // file:// URLs appear as 'null' origin
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());
app.use(cookieParser());

// ============================================
// API ROUTES
// ============================================

// Health check (public)
app.get("/api/health", async (_req, res) => {
  try {
    const db = getDb();
    await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    res.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
      providers: getAvailableProviders(),
      piProviders: getEnabledProviders(),
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.status(503).json({
      status: "error",
      database: "disconnected",
      error: (error as any)?.message || "Unknown error",
    });
  }
});

// Auth routes (public)
app.use("/api/auth", authRoutes);

// Protected routes
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/api-keys", apiKeyRoutes);
app.use("/api", skillsRouter);
app.use("/api/composio", composioRoutes);

// ============================================
// LEGACY CHAT ENDPOINT (deprecated - use Pi Agent instead)
// ============================================
app.post("/api/chat", async (_req, res) => {
  res.status(410).json({
    error: "Endpoint deprecated",
    message:
      "The legacy /api/chat endpoint has been removed. Please use the Pi Agent-based chat implementation.",
    migration: "See apps/server/src/pi/ for the new implementation.",
  });
});

// Abort endpoint (deprecated)
app.post("/api/abort", async (_req, res) => {
  res.status(410).json({
    error: "Endpoint deprecated",
    message:
      "The legacy /api/abort endpoint has been removed. Please use the Pi Agent-based implementation.",
  });
});

// ============================================
// PROVIDERS ENDPOINT
// ============================================

// Get available providers with their models
app.get("/api/providers", (_req, res) => {
  const config = loadPiConfig();
  const enabledProviderIds = config.enabledProviders;
  const allProviders = getProviders();

  // Build provider info for enabled providers only
  const providers: PiProviderInfo[] = enabledProviderIds
    .filter((providerId) => allProviders.includes(providerId as any))
    .map((providerId) => {
      let models: PiModel[] = [];

      try {
        const providerModels = getModels(providerId as any);
        models = providerModels.map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          contextWindow: m.contextWindow,
          maxTokens: m.maxTokens,
          reasoning: m.reasoning,
          cost: m.cost
            ? {
                input: m.cost.input,
                output: m.cost.output,
              }
            : undefined,
        }));
      } catch (e) {
        console.warn(
          `[Providers] Could not get models for ${providerId}:`,
          (e as Error).message,
        );
      }

      // Format provider name nicely
      const name = providerId
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

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

async function startServer() {
  try {
    // Initialize database
    console.log("[DB] Connecting to database...");
    await initializeDatabase();

    // Setup vector support for embeddings
    await setupVectorSupport();
    console.log("[DB] Database initialized");

    // Initialize providers (legacy - no-op now)
    await initializeProviders();

    // Initialize Pi Agent
    await initializePiAgent();

    // Composio is initialized on-demand when first used

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`\n✓ Backend server running on http://localhost:${PORT}`);
      console.log(`✓ Health check: GET http://localhost:${PORT}/api/health`);
      console.log(`✓ Auth: POST http://localhost:${PORT}/api/auth/register`);
      console.log(`✓ Auth: POST http://localhost:${PORT}/api/auth/login`);
      console.log(`✓ Workspaces: http://localhost:${PORT}/api/workspaces`);
      console.log(`✓ Chats: http://localhost:${PORT}/api/chats`);
      console.log(
        `✓ Pi Agent providers: ${getEnabledProviders().join(", ")}\n`,
      );
    });

    // Keep the process alive
    server.on("error", (err) => {
      console.error("Server error:", err);
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\nShutting down server...");
      server.close(async () => {
        await closeDb();
        console.log("Server closed");
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("[STARTUP] Error:", error);
    process.exit(1);
  }
}

startServer();
