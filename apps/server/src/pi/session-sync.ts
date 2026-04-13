/**
 * Session Synchronization Module
 *
 * Handles synchronization between database messages and Pi Agent session files.
 *
 * Problems solved:
 * 1. Dual storage can get out of sync when stream fails midway
 * 2. Recovery mechanism for corrupted/incomplete sessions
 * 3. Deterministic session path (no DB storage needed)
 *
 * Architecture:
 * - Session path is ALWAYS deterministic: .pi/sessions/{workspaceId}/{chatId}.jsonl
 * - Database is the source of truth for message display
 * - Session file is the source of truth for AI context
 * - On mismatch: rebuild session from database
 */

import { existsSync, readFileSync, unlinkSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { DbClient } from "../services/chat.service.js";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import {
	SessionManager as PiSessionManager,
} from "@mariozechner/pi-coding-agent";

/**
 * Get the project root directory.
 * Uses import.meta.url to derive path regardless of process.cwd()
 */
let _projectRoot: string | null = null;

export function getProjectRoot(): string {
	if (!_projectRoot) {
		// For ESM, import.meta.url gives us the file path
		const currentFilePath = fileURLToPath(import.meta.url);
		// Go up from apps/server/src/pi/session-sync.ts to project root
		// session-sync.ts -> pi -> src -> server -> apps -> root
		_projectRoot = path.resolve(currentFilePath, "../../../../../..");
	}
	return _projectRoot;
}

/**
 * Get deterministic session file path.
 *
 * Format: {sessionDir}/{workspaceId}/{chatId}.jsonl
 *
 * This is the ONLY way to get session path - no DB lookup needed.
 */
export function getSessionPath(
	workspaceId: string,
	chatId: string,
	sessionDir?: string
): string {
	const root = sessionDir || path.join(getProjectRoot(), ".pi", "sessions");
	return path.join(root, workspaceId, `${chatId}.jsonl`);
}

/**
 * Get session directory for a workspace.
 */
export function getSessionDir(
	workspaceId: string,
	sessionDir?: string
): string {
	const root = sessionDir || path.join(getProjectRoot(), ".pi", "sessions");
	return path.join(root, workspaceId);
}

/**
 * Ensure session directory exists for a workspace.
 */
export function ensureSessionDir(
	workspaceId: string,
	sessionDir?: string
): string {
	const dir = getSessionDir(workspaceId, sessionDir);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	return dir;
}

/**
 * Check if session file exists.
 */
export function sessionExists(workspaceId: string, chatId: string): boolean {
	const sessionPath = getSessionPath(workspaceId, chatId);
	return existsSync(sessionPath);
}

/**
 * Read session file and count messages.
 */
export function getSessionMessageCount(
	workspaceId: string,
	chatId: string
): number {
	const sessionPath = getSessionPath(workspaceId, chatId);
	if (!existsSync(sessionPath)) {
		return 0;
	}

	try {
		const content = readFileSync(sessionPath, "utf-8");
		const lines = content.trim().split("\n");
		let count = 0;

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const entry = JSON.parse(line);
				if (entry.type === "message" && entry.message?.role) {
					if (entry.message.role === "user" || entry.message.role === "assistant") {
						count++;
					}
				}
			} catch {
				// Skip malformed lines
			}
		}

		return count;
	} catch (error) {
		console.error("[SessionSync] Failed to read session file:", error);
		return 0;
	}
}

/**
 * Get database message count for a chat.
 */
export async function getDbMessageCount(
	db: DbClient,
	chatId: string
): Promise<number> {
	const messages = await db
		.select()
		.from(schema.messages)
		.where(eq(schema.messages.chatId, chatId));

	return messages.length;
}

/**
 * Sync status between database and session file.
 */
export interface SyncStatus {
	/** Whether session file exists */
	sessionExists: boolean;
	/** Number of messages in session file */
	sessionMessageCount: number;
	/** Number of messages in database */
	dbMessageCount: number;
	/** Whether they are in sync */
	inSync: boolean;
	/** Recommended action */
	action: "none" | "rebuild_session" | "rebuild_db" | "investigate";
}

/**
 * Check sync status between database and session file.
 *
 * This helps detect when things get out of sync.
 */
export async function checkSyncStatus(
	db: DbClient,
	workspaceId: string,
	chatId: string
): Promise<SyncStatus> {
	const sessionExists_ = sessionExists(workspaceId, chatId);
	const sessionCount = sessionExists_ ? getSessionMessageCount(workspaceId, chatId) : 0;
	const dbCount = await getDbMessageCount(db, chatId);

	let inSync = sessionCount === dbCount;
	let action: SyncStatus["action"] = "none";

	// Determine recommended action
	if (!sessionExists_ && dbCount > 0) {
		// Session missing but DB has messages - rebuild session
		action = "rebuild_session";
		inSync = false;
	} else if (sessionExists_ && dbCount === 0 && sessionCount > 0) {
		// DB missing but session has messages - rebuild DB (rare)
		action = "rebuild_db";
		inSync = false;
	} else if (sessionCount !== dbCount) {
		// Mismatch - investigate
		action = "investigate";
		inSync = false;
	}

	return {
		sessionExists: sessionExists_,
		sessionMessageCount: sessionCount,
		dbMessageCount: dbCount,
		inSync,
		action,
	};
}

/**
 * Rebuild session file from database messages.
 *
 * Used when session file is missing or corrupted but DB has the messages.
 * This ensures AI has proper conversation context.
 */
export async function rebuildSessionFromDb(
	db: DbClient,
	workspaceId: string,
	chatId: string
): Promise<void> {
	console.log(`[SessionSync] Rebuilding session from DB for chat ${chatId}`);

	// Get messages from DB
	const messages = await db
		.select()
		.from(schema.messages)
		.where(eq(schema.messages.chatId, chatId))
		.orderBy(schema.messages.createdAt);

	if (messages.length === 0) {
		console.log(`[SessionSync] No messages in DB, nothing to rebuild`);
		return;
	}

	// Get session path and ensure directory exists
	const sessionPath = getSessionPath(workspaceId, chatId);
	ensureSessionDir(workspaceId);

	// Delete existing session if any
	if (existsSync(sessionPath)) {
		unlinkSync(sessionPath);
	}

	// Create new session and append messages
	const sessionManager = PiSessionManager.open(sessionPath);

	for (const msg of messages) {
		const timestamp = msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now();

		if (msg.role === "user") {
			sessionManager.appendMessage({
				role: "user",
				content: msg.content,
				timestamp,
			});
		} else if (msg.role === "assistant") {
			// Create minimal assistant message
			sessionManager.appendMessage({
				role: "assistant",
				content: [{ type: "text", text: msg.content }],
				timestamp,
				api: "unknown",
				provider: "unknown",
				model: "unknown",
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
			} as any);
		}
	}

	console.log(`[SessionSync] Rebuilt session with ${messages.length} messages`);
}

/**
 * Rebuild database messages from session file.
 *
 * Used when DB is missing messages but session file exists.
 * This ensures UI shows all messages.
 */
export async function rebuildDbFromSession(
	db: DbClient,
	workspaceId: string,
	chatId: string
): Promise<void> {
	console.log(`[SessionSync] Rebuilding DB from session for chat ${chatId}`);

	const sessionPath = getSessionPath(workspaceId, chatId);
	if (!existsSync(sessionPath)) {
		console.log(`[SessionSync] No session file to rebuild from`);
		return;
	}

	// Read session entries
	const content = readFileSync(sessionPath, "utf-8");
	const lines = content.trim().split("\n");

	// Get existing messages to avoid duplicates
	const existingMessages = await db
		.select()
		.from(schema.messages)
		.where(eq(schema.messages.chatId, chatId));

	const existingUserCount = existingMessages.filter(m => m.role === "user").length;
	const existingAssistantCount = existingMessages.filter(m => m.role === "assistant").length;

	let added = 0;
	let userCount = 0;
	let assistantCount = 0;

	for (const line of lines) {
		if (!line.trim()) continue;

		try {
			const entry = JSON.parse(line);
			if (entry.type !== "message" || !entry.message?.role) continue;

			const role = entry.message.role;
			if (role !== "user" && role !== "assistant") continue;

			// Extract text content
			let textContent = "";
			if (typeof entry.message.content === "string") {
				textContent = entry.message.content;
			} else if (Array.isArray(entry.message.content)) {
				textContent = entry.message.content
					.filter((block: any) => block.type === "text")
					.map((block: any) => block.text)
					.join("");
			}

			if (!textContent) continue;

			// Count messages by role
			if (role === "user") {
				userCount++;
				// Skip if we already have enough user messages
				if (userCount <= existingUserCount) continue;
			} else {
				assistantCount++;
				// Skip if we already have enough assistant messages
				if (assistantCount <= existingAssistantCount) continue;
			}

			// Insert the message
			const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
			await db.insert(schema.messages).values({
				chatId,
				role,
				content: textContent,
				createdAt: timestamp,
			});
			added++;
		} catch (err) {
			console.error("[SessionSync] Failed to parse session entry:", err);
		}
	}

	console.log(`[SessionSync] Added ${added} messages to DB`);
}

/**
 * Auto-repair sync issues.
 *
 * This should be called when a chat is loaded and sync issues are detected.
 */
export async function repairSync(
	db: DbClient,
	workspaceId: string,
	chatId: string
): Promise<{ repaired: boolean; action: string }> {
	const status = await checkSyncStatus(db, workspaceId, chatId);

	if (status.inSync) {
		return { repaired: false, action: "none" };
	}

	console.log(`[SessionSync] Repairing sync for chat ${chatId}:`, status);

	switch (status.action) {
		case "rebuild_session":
			await rebuildSessionFromDb(db, workspaceId, chatId);
			return { repaired: true, action: "rebuild_session" };

		case "rebuild_db":
			await rebuildDbFromSession(db, workspaceId, chatId);
			return { repaired: true, action: "rebuild_db" };

		case "investigate":
			// Default to rebuilding session from DB (DB is usually more reliable)
			console.warn(
				`[SessionSync] Message count mismatch: DB=${status.dbMessageCount}, Session=${status.sessionMessageCount}. Rebuilding session.`
			);
			await rebuildSessionFromDb(db, workspaceId, chatId);
			return { repaired: true, action: "rebuild_session" };

		default:
			return { repaired: false, action: "none" };
	}
}

/**
 * Validate session file integrity.
 *
 * Checks if the session file is valid JSONL and can be parsed.
 */
export function validateSessionIntegrity(
	workspaceId: string,
	chatId: string
): { valid: boolean; error?: string; lineCount: number } {
	const sessionPath = getSessionPath(workspaceId, chatId);

	if (!existsSync(sessionPath)) {
		return { valid: true, lineCount: 0 }; // No file is valid (new chat)
	}

	try {
		const content = readFileSync(sessionPath, "utf-8");
		const lines = content.trim().split("\n");
		let validLines = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!line.trim()) continue;

			try {
				const entry = JSON.parse(line);
				if (entry.type) {
					validLines++;
				}
			} catch (err) {
				return {
					valid: false,
					error: `Invalid JSON at line ${i + 1}: ${(err as Error).message}`,
					lineCount: i,
				};
			}
		}

		return { valid: true, lineCount: validLines };
	} catch (error) {
		return {
			valid: false,
			error: `Failed to read file: ${(error as Error).message}`,
			lineCount: 0,
		};
	}
}