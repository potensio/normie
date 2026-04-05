/**
 * Session Manager Module
 *
 * Wraps Pi's SessionManager to provide JSONL-based session storage
 * with tree structure support for conversation branching.
 *
 * Each chat gets a dedicated JSONL file stored in:
 * .pi/sessions/{workspaceId}/{chatId}.jsonl
 */

import {
	SessionManager as PiSessionManager,
	type SessionEntry,
	type SessionContext,
} from "@mariozechner/pi-coding-agent";
import path from "path";
import { existsSync, mkdirSync } from "fs";

/**
 * Tree node for getTree() - defensive copy of session structure
 * Note: This is not exported by pi-coding-agent, so we define it locally
 */
export interface SessionTreeNode {
	entry: SessionEntry;
	children: SessionTreeNode[];
	label?: string;
}

export interface SessionConfig {
	workspaceId: string;
	chatId: string;
	sessionDir?: string; // Default: .pi/sessions
}

export interface AppendMessage {
	role: "user" | "assistant";
	content: string;
	timestamp: number;
}

/**
 * NormieSessionManager wraps Pi's SessionManager for Normie-specific session handling.
 *
 * Features:
 * - JSONL file storage per chat
 * - Tree structure for conversation branching
 * - Atomic file operations via Pi's SessionManager
 * - Crash-safe persistence
 *
 * @example
 * // Create new session
 * const manager = new NormieSessionManager({
 *   workspaceId: "ws-123",
 *   chatId: "chat-456",
 * });
 *
 * // Append message
 * manager.appendMessage({
 *   role: "user",
 *   content: "Hello!",
 *   timestamp: Date.now(),
 * });
 *
 * // Build context for LLM
 * const { messages, thinkingLevel, model } = manager.buildContext();
 */
export class NormieSessionManager {
	private piSessionManager: PiSessionManager;
	private sessionFilePath: string;
	private workspaceId: string;
	private chatId: string;

	constructor(config: SessionConfig) {
		this.workspaceId = config.workspaceId;
		this.chatId = config.chatId;

		// Determine session directory
		const sessionDir = config.sessionDir || ".pi/sessions";
		const workspaceDir = path.join(sessionDir, config.workspaceId);
		this.sessionFilePath = path.join(workspaceDir, `${config.chatId}.jsonl`);

		// Ensure directory exists synchronously (Pi's SessionManager expects it)
		if (!existsSync(workspaceDir)) {
			mkdirSync(workspaceDir, { recursive: true });
		}

		// Initialize Pi SessionManager
		// Use .open() for existing files, .create() will also work for new files
		this.piSessionManager = PiSessionManager.open(this.sessionFilePath);
	}

	/**
	 * Get the underlying Pi SessionManager for advanced operations.
	 *
	 * Use this when you need direct access to Pi's session API,
	 * such as when creating an agent session.
	 *
	 * @example
	 * const { session } = await createAgentSession({
	 *   sessionManager: normieManager.getPiSessionManager(),
	 *   // ...
	 * });
	 */
	getPiSessionManager(): PiSessionManager {
		return this.piSessionManager;
	}

	/**
	 * Get the session file path.
	 *
	 * Format: .pi/sessions/{workspaceId}/{chatId}.jsonl
	 */
	getSessionFilePath(): string {
		return this.sessionFilePath;
	}

	/**
	 * Get the workspace ID for this session.
	 */
	getWorkspaceId(): string {
		return this.workspaceId;
	}

	/**
	 * Get the chat ID for this session.
	 */
	getChatId(): string {
		return this.chatId;
	}

	/**
	 * Build conversation context from JSONL for LLM consumption.
	 *
	 * Returns messages in the format needed by Pi's agent,
	 * along with current thinking level and model settings.
	 *
	 * @returns Object containing messages, thinkingLevel, and model
	 */
	buildContext(): SessionContext {
		return this.piSessionManager.buildSessionContext();
	}

	/**
	 * Get the leaf entry (most recent message in current branch).
	 *
	 * Returns null if the session has no entries yet.
	 */
	getLeafEntry(): SessionEntry | null {
		const entry = this.piSessionManager.getLeafEntry();
		return entry ?? null;
	}

	/**
	 * Branch from a specific entry.
	 *
	 * Moves the leaf pointer to the specified entry. The next append
	 * will create a child of that entry, forming a new branch.
	 * Existing entries are not modified (append-only structure).
	 *
	 * @param entryId - The ID of the entry to branch from
	 */
	branch(entryId: string): void {
		this.piSessionManager.branch(entryId);
	}

	/**
	 * Get the full conversation tree structure.
	 *
	 * Useful for rendering branch navigation UI or
	 * understanding conversation structure.
	 *
	 * @returns Array of tree nodes representing the session
	 */
	getTree(): SessionTreeNode[] {
		return this.piSessionManager.getTree() as SessionTreeNode[];
	}

	/**
	 * Append a message to the session.
	 *
	 * The message is appended as a child of the current leaf,
	 * and becomes the new leaf.
	 *
	 * @param message - The message to append
	 * @returns The entry ID of the new message
	 */
	appendMessage(message: AppendMessage): string {
		if (message.role === "user") {
			// User message: simple text content
			return this.piSessionManager.appendMessage({
				role: "user",
				content: message.content,
				timestamp: message.timestamp,
			});
		} else {
			// For assistant messages, we need to create a minimal AssistantMessage
			// Pi's appendMessage expects a full AssistantMessage with api, provider, etc.
			// But the internal implementation only requires role and content for casting
			// We'll use a type assertion to work around this
			const assistantMsg = {
				role: "assistant" as const,
				content: [{ type: "text" as const, text: message.content }],
				timestamp: message.timestamp,
				// Required fields for AssistantMessage - these are stubs
				// Pi will handle the actual provider/model when used in a session
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
				stopReason: "stop" as const,
			};
			return this.piSessionManager.appendMessage(assistantMsg as any);
		}
	}

	/**
	 * Get all entries in the session (excludes header).
	 *
	 * @returns Array of all session entries
	 */
	getEntries(): SessionEntry[] {
		return this.piSessionManager.getEntries();
	}

	/**
	 * Get entry by ID.
	 *
	 * @param id - The entry ID
	 * @returns The entry or undefined if not found
	 */
	getEntry(id: string): SessionEntry | undefined {
		return this.piSessionManager.getEntry(id);
	}

	/**
	 * Get the session ID (UUID from header).
	 */
	getSessionId(): string {
		return this.piSessionManager.getSessionId();
	}

	/**
	 * Check if this session is persisted to disk.
	 */
	isPersisted(): boolean {
		return this.piSessionManager.isPersisted();
	}

	/**
	 * Create a new branch session from an existing session.
	 *
	 * This creates a new session file with the chat ID suffixed
	 * with a timestamp. The history up to the branch point is
	 * copied to the new session.
	 *
	 * @param config - Session configuration
	 * @param branchFromEntryId - The entry ID to branch from
	 * @returns A new NormieSessionManager for the branched session
	 *
	 * @example
	 * const branchSession = await NormieSessionManager.createBranch(
	 *   { workspaceId: "ws-123", chatId: "chat-456" },
	 *   "entry-5",
	 * );
	 */
	static async createBranch(
		config: SessionConfig,
		branchFromEntryId: string,
	): Promise<NormieSessionManager> {
		// Load parent session
		const parentSession = new NormieSessionManager(config);

		// Verify the entry exists
		const branchEntry = parentSession.getEntry(branchFromEntryId);
		if (!branchEntry) {
			throw new Error(
				`[SessionManager] Entry ${branchFromEntryId} not found in session`,
			);
		}

		// Get history up to branch point
		const history = this.getHistoryUpToEntry(parentSession, branchFromEntryId);

		// Create new session with branch suffix
		const branchChatId = `${config.chatId}-branch-${Date.now()}`;
		const branchConfig: SessionConfig = {
			...config,
			chatId: branchChatId,
		};

		const branchSession = new NormieSessionManager(branchConfig);

		// Copy history entries to new session
		for (const entry of history) {
			// Only copy message entries (not compaction, model changes, etc.)
			if (entry.type === "message" && "message" in entry) {
				const msg = entry.message;
				if ("role" in msg && "content" in msg) {
					// Extract text content
					let content: string;
					if (typeof msg.content === "string") {
						content = msg.content;
					} else if (Array.isArray(msg.content)) {
						// Extract text from content blocks
						content = msg.content
							.filter(
								(block): block is { type: "text"; text: string } =>
									block.type === "text",
							)
							.map((block) => block.text)
							.join("");
					} else {
						content = "";
					}

					// Get timestamp from entry
					const timestamp = entry.timestamp
						? new Date(entry.timestamp).getTime()
						: Date.now();

					// Only copy user and assistant messages
					if (msg.role === "user" || msg.role === "assistant") {
						branchSession.appendMessage({
							role: msg.role,
							content,
							timestamp,
						});
					}
				}
			}
		}

		return branchSession;
	}

	/**
	 * Helper: Extract history from root up to a specific entry.
	 *
	 * @param session - The session manager
	 * @param targetEntryId - The entry ID to stop at
	 * @returns Array of entries from root to target (inclusive)
	 */
	private static getHistoryUpToEntry(
		session: NormieSessionManager,
		targetEntryId: string,
	): SessionEntry[] {
		const result: SessionEntry[] = [];
		const entries = session.getEntries();

		// Build parent map
		const byId = new Map<string, SessionEntry>();
		for (const entry of entries) {
			byId.set(entry.id, entry);
		}

		// Walk from target to root, collecting entries
		let current = byId.get(targetEntryId);
		while (current) {
			result.unshift(current);
			if (current.parentId) {
				current = byId.get(current.parentId);
			} else {
				break;
			}
		}

		return result;
	}

	/**
	 * Get the current leaf ID.
	 *
	 * @returns The current leaf entry ID, or null if no entries
	 */
	getLeafId(): string | null {
		return this.piSessionManager.getLeafId();
	}

	/**
	 * Get entries on the path from root to current leaf.
	 *
	 * @returns Array of entries in path order
	 */
	getCurrentBranch(): SessionEntry[] {
		return this.piSessionManager.getBranch();
	}
}
