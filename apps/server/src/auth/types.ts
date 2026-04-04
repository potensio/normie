import type { users, workspaces } from '../db/schema.js';

// ============================================
// EXPRESS REQUEST EXTENSION
// ============================================

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: SelectUser;
      sessionId?: string;
      workspace?: SelectWorkspace;
      isWorkspaceOwner?: boolean;
      workspaceRole?: string;
    }
  }
}

// ============================================
// USER TYPES
// ============================================

// Full user type from database (includes passwordHash)
export type SelectUser = typeof users.$inferSelect;

// User type for getUserById (subset without passwordHash/updatedAt)
export type SelectUserSafe = {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean | null;
  createdAt: Date | null;
  lastLoginAt: Date | null;
};

// Public user type (safe to return to client)
export type UserWithoutPassword = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date | null;
};

export type CreateUserInput = {
  email: string;
  password: string;
  displayName?: string | null;
};

// ============================================
// WORKSPACE TYPES
// ============================================

export type SelectWorkspace = typeof workspaces.$inferSelect;

// ============================================
// JWT TYPES
// ============================================

export interface JwtPayload {
  userId: string;
  type?: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ============================================
// AUTH RESULT TYPES
// ============================================

export interface AuthResult {
  user: UserWithoutPassword;
  accessToken: string;
  refreshToken: string;
}

// ============================================
// API KEY TYPES
// ============================================

export type ApiKeyProvider = string;

export interface ApiKeyInfo {
  id: string;
  provider: string;
  keyPreview: string | null;
  isValid: boolean | null;
  createdAt: Date | null;
  lastUsedAt: Date | null;
}

// Re-export for augmentation
export { users, workspaces };
