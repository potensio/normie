/**
 * Active Session Tracker Service
 *
 * Tracks active chat sessions that are using specific toolkits.
 * Used to warn about disconnects when sessions are active.
 */

/**
 * Information about an active tool session.
 */
export interface ActiveToolSession {
  /** Chat session ID */
  chatId: string;
  /** Workspace ID */
  workspaceId: string;
  /** Toolkits currently in use in this session */
  toolkits: Set<string>;
  /** When the session started */
  startedAt: Date;
  /** User ID who started the session */
  userId: string;
}

/**
 * Session tracker interface.
 */
export interface ActiveSessionTracker {
  /** Register a new session */
  registerSession(
    chatId: string,
    workspaceId: string,
    userId: string,
    toolkits: string[]
  ): void;

  /** Unregister a session */
  unregisterSession(chatId: string): void;

  /** Check if a toolkit is in use in any session */
  isToolkitInUse(workspaceId: string, toolkitSlug: string): boolean;

  /** Get sessions using a specific toolkit */
  getSessionsUsingToolkit(
    workspaceId: string,
    toolkitSlug: string
  ): ActiveToolSession[];

  /** Get all active sessions for a workspace */
  getWorkspaceSessions(workspaceId: string): ActiveToolSession[];

  /** Update toolkits for an existing session */
  updateSessionToolkits(chatId: string, toolkits: string[]): void;

  /** Get stats for monitoring */
  getStats(): {
    totalSessions: number;
    workspaces: number;
    toolkitUsage: Record<string, number>;
  };
}

/**
 * Create an active session tracker.
 *
 * Uses in-memory Map storage, suitable for single server deployment.
 * For multi-server deployment, replace with Redis-backed implementation.
 */
export function createActiveSessionTracker(): ActiveSessionTracker {
  // chatId -> session
  const sessions = new Map<string, ActiveToolSession>();

  // workspaceId -> Set of chatIds (for fast lookup)
  const workspaceSessions = new Map<string, Set<string>>();

  return {
    registerSession(chatId, workspaceId, userId, toolkits) {
      const session: ActiveToolSession = {
        chatId,
        workspaceId,
        toolkits: new Set(toolkits),
        startedAt: new Date(),
        userId,
      };

      sessions.set(chatId, session);

      // Add to workspace index
      if (!workspaceSessions.has(workspaceId)) {
        workspaceSessions.set(workspaceId, new Set());
      }
      workspaceSessions.get(workspaceId)!.add(chatId);

      console.log(
        `[SessionTracker] Registered session ${chatId} with toolkits: ${toolkits.join(', ')}`
      );
    },

    unregisterSession(chatId) {
      const session = sessions.get(chatId);
      if (!session) return;

      sessions.delete(chatId);

      // Remove from workspace index
      const workspaceSet = workspaceSessions.get(session.workspaceId);
      if (workspaceSet) {
        workspaceSet.delete(chatId);
        if (workspaceSet.size === 0) {
          workspaceSessions.delete(session.workspaceId);
        }
      }

      console.log(`[SessionTracker] Unregistered session ${chatId}`);
    },

    isToolkitInUse(workspaceId, toolkitSlug) {
      const workspaceSet = workspaceSessions.get(workspaceId);
      if (!workspaceSet) return false;

      for (const chatId of workspaceSet) {
        const session = sessions.get(chatId);
        if (session?.toolkits.has(toolkitSlug)) {
          return true;
        }
      }

      return false;
    },

    getSessionsUsingToolkit(workspaceId, toolkitSlug) {
      const result: ActiveToolSession[] = [];
      const workspaceSet = workspaceSessions.get(workspaceId);

      if (!workspaceSet) return result;

      for (const chatId of workspaceSet) {
        const session = sessions.get(chatId);
        if (session?.toolkits.has(toolkitSlug)) {
          result.push(session);
        }
      }

      return result;
    },

    getWorkspaceSessions(workspaceId) {
      const result: ActiveToolSession[] = [];
      const workspaceSet = workspaceSessions.get(workspaceId);

      if (!workspaceSet) return result;

      for (const chatId of workspaceSet) {
        const session = sessions.get(chatId);
        if (session) {
          result.push(session);
        }
      }

      return result;
    },

    updateSessionToolkits(chatId, toolkits) {
      const session = sessions.get(chatId);
      if (session) {
        session.toolkits = new Set(toolkits);
        console.log(
          `[SessionTracker] Updated session ${chatId} toolkits: ${toolkits.join(', ')}`
        );
      }
    },

    getStats() {
      const toolkitUsage: Record<string, number> = {};

      for (const session of sessions.values()) {
        for (const toolkit of session.toolkits) {
          toolkitUsage[toolkit] = (toolkitUsage[toolkit] || 0) + 1;
        }
      }

      return {
        totalSessions: sessions.size,
        workspaces: workspaceSessions.size,
        toolkitUsage,
      };
    },
  };
}

/**
 * Global session tracker instance.
 * Created lazily on first use.
 */
let globalTracker: ActiveSessionTracker | null = null;

/**
 * Get the global session tracker instance.
 */
export function getActiveSessionTracker(): ActiveSessionTracker {
  if (!globalTracker) {
    globalTracker = createActiveSessionTracker();
  }
  return globalTracker;
}