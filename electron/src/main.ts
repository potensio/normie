import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import crypto from "crypto";

// Store the backend server process
let backendProcess: ChildProcess | null = null;
let isQuitting = false;

// Safe console.log that handles EPIPE
function safeLog(prefix: string, message: string): void {
  if (isQuitting) return;
  try {
    // Use process.stdout.write directly with error handling
    process.stdout.write(`${prefix} ${message}\n`, (err) => {
      // Ignore EPIPE and other write errors
      if (err && err.message?.includes("EPIPE")) {
        // Mark as quitting to prevent further logs
        isQuitting = true;
      }
    });
  } catch (e) {
    // Ignore EPIPE errors during quit
  }
}

// Wait for Vite dev server to be ready
async function waitForVite(maxAttempts: number = 30): Promise<boolean> {
  const http = await import("http");
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get("http://localhost:5173", (res) => {
          resolve(res);
        });
        req.on("error", reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error("timeout"));
        });
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

// Create the browser window
async function createWindow(): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 12, y: 12 },
    show: false, // Don't show until loaded
  });

  // Load the app
  // Check if we're in development (Vite dev server should be running)
  const isDev =
    process.env.NODE_ENV === "development" ||
    !fs.existsSync(
      path.join(__dirname, "..", "apps", "web", "dist", "index.html"),
    );

  if (isDev) {
    // Wait for Vite dev server to be ready
    safeLog("[Main]", "Waiting for Vite dev server...");
    const viteReady = await waitForVite();
    if (!viteReady) {
      safeLog("[Main]", "Vite dev server not available, loading anyway...");
    }
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // Load production build
    mainWindow.loadFile(
      path.join(__dirname, "..", "apps", "web", "dist", "index.html"),
    );
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open all external URLs in default browser
    if (url.startsWith("http://") || url.startsWith("https://")) {
      // Use setTimeout to ensure we don't block the handler
      setTimeout(() => {
        shell.openExternal(url);
      }, 0);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Prevent accidental navigation away from app
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const isAppUrl =
      url.startsWith("http://localhost:5173") ||
      url.startsWith("http://localhost:3001") ||
      url.startsWith("file://");

    if (
      !isAppUrl &&
      (url.startsWith("http://") || url.startsWith("https://"))
    ) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  return mainWindow;
}

// Start the backend server
function startBackend(): void {
  safeLog("[Main]", "Starting backend server...");

  backendProcess = spawn("npx", ["tsx", "apps/server/src/index.ts"], {
    cwd: path.join(__dirname, "..", ".."),
    stdio: "pipe",
  });

  backendProcess.stdout?.on("data", (data: Buffer) => {
    safeLog("[Backend]", data.toString().trim());
  });

  backendProcess.stderr?.on("data", (data: Buffer) => {
    safeLog("[Backend Error]", data.toString().trim());
  });

  backendProcess.on("close", (code: number | null) => {
    safeLog("[Backend]", `Process exited with code ${code}`);
  });

  backendProcess.on("error", (err: Error) => {
    safeLog("[Backend]", `Failed to start: ${err.message}`);
  });
}

// Stop the backend server
function stopBackend(): void {
  if (backendProcess) {
    safeLog("[Main]", "Stopping backend server...");
    backendProcess.kill();
    backendProcess = null;
  }
}

// ============================================
// FILE ATTACHMENT HELPERS
// ============================================

/**
 * Get attachments directory path
 */
function getAttachmentsDir(): string {
  return path.join(app.getPath("userData"), "attachments");
}

/**
 * Ensure chat attachments directory exists
 */
function ensureAttachmentsDir(chatId: string): string {
  const dir = path.join(getAttachmentsDir(), chatId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get MIME type from file extension
 */
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".csv": "text/csv",
    ".xml": "application/xml",
    ".ts": "text/typescript",
    ".tsx": "text/typescript-jsx",
    ".js": "text/javascript",
    ".jsx": "text/javascript-jsx",
    ".py": "text/x-python",
    ".go": "text/x-go",
    ".rs": "text/x-rust",
    ".java": "text/x-java",
    ".c": "text/x-c",
    ".cpp": "text/x-cpp",
    ".h": "text/x-header",
  };
  return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
}

/**
 * Generate a unique filename
 */
function generateUniqueFilename(originalName: string): string {
  const ext = path.extname(originalName);
  const uuid = crypto.randomUUID();
  return `${uuid}${ext}`;
}

// App event handlers
app.whenReady().then(async () => {
  // Start backend server
  startBackend();

  // Register IPC handler for opening external URLs
  ipcMain.handle("open-external", async (_event, url: string) => {
    try {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        await shell.openExternal(url);
        return { success: true };
      }
      return { success: false, error: "Invalid URL protocol" };
    } catch (error) {
      safeLog("[Main]", `Failed to open external URL: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // ============================================
  // FILE ATTACHMENT IPC HANDLERS
  // ============================================

  // Select files or folders
  ipcMain.handle("select-paths", async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ["multiSelections", "openFile", "openDirectory"],
        filters: [{ name: "All Files", extensions: ["*"] }],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, paths: [] };
      }

      const paths = result.filePaths.map((filePath) => {
        const stats = fs.statSync(filePath);
        return {
          path: filePath,
          name: path.basename(filePath),
          isDirectory: stats.isDirectory(),
          size: stats.isDirectory() ? 0 : stats.size,
        };
      });

      return { success: true, paths };
    } catch (error) {
      safeLog("[Main]", `Failed to select paths: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // Save attachments to disk
  ipcMain.handle(
    "save-attachments",
    async (
      _event,
      chatId: string,
      files: Array<{ data: string; name: string; type: string; size: number }>,
    ) => {
      try {
        const attachmentsDir = ensureAttachmentsDir(chatId);
        const savedAttachments: Array<{
          filename: string;
          originalName: string;
          mimeType: string;
          size: number;
          storagePath: string;
        }> = [];

        for (const file of files) {
          // Generate unique filename
          const filename = generateUniqueFilename(file.name);
          const filePath = path.join(attachmentsDir, filename);

          // Extract base64 data from data URL
          const matches = file.data.match(/^data:([^;]+);base64,(.+)$/);
          if (!matches) {
            safeLog("[Main]", `Invalid data URL for file: ${file.name}`);
            continue;
          }

          const mimeType = matches[1];
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, "base64");

          // Write file
          fs.writeFileSync(filePath, buffer);

          // Create storage path (relative to attachments dir)
          const storagePath = path.join(chatId, filename);

          savedAttachments.push({
            filename,
            originalName: file.name,
            mimeType,
            size: file.size,
            storagePath,
          });
        }

        return { success: true, attachments: savedAttachments };
      } catch (error) {
        safeLog("[Main]", `Failed to save attachments: ${error}`);
        return { success: false, error: String(error) };
      }
    },
  );

  // Read attachment from disk
  ipcMain.handle("read-attachment", async (_event, storagePath: string) => {
    try {
      const fullPath = path.join(getAttachmentsDir(), storagePath);
      const buffer = fs.readFileSync(fullPath);
      const ext = path.extname(fullPath);
      const mimeType = getMimeType(ext);
      const base64 = buffer.toString("base64");
      return {
        data: `data:${mimeType};base64,${base64}`,
        mimeType,
      };
    } catch (error) {
      safeLog("[Main]", `Failed to read attachment: ${error}`);
      throw error;
    }
  });

  // Delete all attachments for a chat
  ipcMain.handle("delete-chat-attachments", async (_event, chatId: string) => {
    try {
      const chatDir = path.join(getAttachmentsDir(), chatId);
      if (fs.existsSync(chatDir)) {
        fs.rmSync(chatDir, { recursive: true, force: true });
      }
    } catch (error) {
      safeLog("[Main]", `Failed to delete chat attachments: ${error}`);
      // Don't throw - best effort cleanup
    }
  });

  // Open attachment with system default app
  ipcMain.handle("open-attachment", async (_event, storagePath: string) => {
    try {
      const fullPath = path.join(getAttachmentsDir(), storagePath);
      await shell.openPath(fullPath);
    } catch (error) {
      safeLog("[Main]", `Failed to open attachment: ${error}`);
    }
  });

  // Create window after a short delay to let backend start
  setTimeout(async () => {
    await createWindow();
  }, 2000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  isQuitting = true;
  stopBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  stopBackend();
});

app.on("will-quit", () => {
  isQuitting = true;
  stopBackend();
});

// Handle EPIPE errors globally
process.on("uncaughtException", (error: Error) => {
  if (error.message?.includes("EPIPE")) {
    // Ignore EPIPE errors - they happen when stdout is closed
    isQuitting = true;
    return;
  }
  // Re-throw other errors
  throw error;
});
