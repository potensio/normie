import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  createSession,
  getSession,
  deleteSession,
  deleteAllUserSessions,
  SESSION_DURATION_MS,
  ACCESS_TOKEN_DURATION,
  type SessionData
} from './session.js';

// Import types for Express augmentation
import './types.js';

// ============================================
// HELPER FUNCTIONS
// ============================================

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('WARNING: JWT_SECRET not set. Using fallback. Set JWT_SECRET in production.');
    return 'fallback-secret-change-in-production';
  }
  return secret;
}

// ============================================
// USER FUNCTIONS
// ============================================

export interface SafeUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date | null;
}

export async function createUser(
  email: string,
  password: string,
  displayName: string | null = null
): Promise<SafeUser> {
  const db = getDb();
  const passwordHash = await bcrypt.hash(password, 12);
  
  const [user] = await db.insert(schema.users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      displayName
    })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      createdAt: schema.users.createdAt
    });
  
  // Create default workspace
  await db.insert(schema.workspaces)
    .values({
      ownerId: user.id,
      name: 'Default',
      isDefault: true
    });
  
  // Create default preferences
  await db.insert(schema.userPreferences)
    .values({ userId: user.id });
  
  return user;
}

export async function getUserByEmail(email: string) {
  const db = getDb();
  const [user] = await db.select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()));
  return user;
}

export async function getUserById(id: string) {
  const db = getDb();
  const [user] = await db.select({
    id: schema.users.id,
    email: schema.users.email,
    displayName: schema.users.displayName,
    isActive: schema.users.isActive,
    createdAt: schema.users.createdAt,
    lastLoginAt: schema.users.lastLoginAt
  })
    .from(schema.users)
    .where(eq(schema.users.id, id));
  return user;
}

// ============================================
// AUTH FUNCTIONS (SESSION + JWT)
// ============================================

export interface AuthResult {
  user: SafeUser;
  sessionId: string;
  accessToken: string;
  expiresIn: number;
}

export async function register(
  email: string,
  password: string,
  displayName: string | null = null,
  userAgent?: string,
  ipAddress?: string
): Promise<AuthResult> {
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error('Email already registered');
  }

  const user = await createUser(email, password, displayName);
  const { sessionId, expiresAt } = await createSession(user.id, userAgent, ipAddress);
  const accessToken = generateAccessToken(user.id);
  
  return { 
    user, 
    sessionId, 
    accessToken,
    expiresIn: 15 * 60 // 15 minutes in seconds
  };
}

export async function login(
  email: string,
  password: string,
  userAgent?: string,
  ipAddress?: string
): Promise<AuthResult> {
  const user = await getUserByEmail(email);
  if (!user || !user.isActive) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  const db = getDb();
  await db.update(schema.users)
    .set({ lastLoginAt: new Date() })
    .where(eq(schema.users.id, user.id));

  const { sessionId } = await createSession(user.id, userAgent, ipAddress);
  const accessToken = generateAccessToken(user.id);
  
  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt },
    sessionId,
    accessToken,
    expiresIn: 15 * 60
  };
}

export function generateAccessToken(userId: string): string {
  const jwtSecret = getJwtSecret();
  return jwt.sign(
    { userId, type: 'access' },
    jwtSecret,
    { expiresIn: ACCESS_TOKEN_DURATION }
  );
}

export async function refreshAuth(sessionId: string, ipAddress?: string): Promise<{ accessToken: string; expiresIn: number } | null> {
  const session = await getSession(sessionId);
  if (!session) {
    return null;
  }
  
  // Optionally update session IP
  if (ipAddress) {
    const db = getDb();
    await db.update(schema.sessions)
      .set({ ipAddress })
      .where(eq(schema.sessions.id, sessionId));
  }
  
  return {
    accessToken: generateAccessToken(session.userId),
    expiresIn: 15 * 60
  };
}

export async function logout(sessionId: string): Promise<void> {
  await deleteSession(sessionId);
}

export async function logoutAll(userId: string): Promise<void> {
  await deleteAllUserSessions(userId);
}

// ============================================
// AUTH MIDDLEWARE
// ============================================

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Get session ID from cookie
  const sessionId = req.cookies?.sessionId as string | undefined;
  
  if (!sessionId) {
    res.status(401).json({ error: 'No session', code: 'NO_SESSION' });
    return;
  }
  
  // Validate session
  const session = await getSession(sessionId);
  if (!session) {
    res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    return;
  }
  
  // Get access token from cookie or header
  let accessToken: string | undefined = req.cookies?.accessToken as string | undefined;
  
  if (!accessToken) {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      accessToken = auth.slice(7);
    }
  }
  
  if (!accessToken) {
    // No access token, but session is valid - need to refresh
    res.status(401).json({ error: 'Token required', code: 'TOKEN_REQUIRED' });
    return;
  }
  
  // Verify access token
  try {
    const jwtSecret = getJwtSecret();
    const payload = jwt.verify(accessToken, jwtSecret) as { userId: string; type: string };
    
    // Ensure token belongs to session user
    if (payload.userId !== session.userId) {
      res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
      return;
    }
    
    req.userId = payload.userId;
    req.sessionId = sessionId;
    next();
  } catch {
    // Token expired or invalid - client should refresh
    res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
  }
}

// Optional auth - populate user if logged in, but don't require it
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionId = req.cookies?.sessionId as string | undefined;
  
  if (!sessionId) {
    next();
    return;
  }
  
  const session = await getSession(sessionId);
  if (!session) {
    next();
    return;
  }
  
  const accessToken = req.cookies?.accessToken as string | undefined;
  if (!accessToken) {
    next();
    return;
  }
  
  try {
    const jwtSecret = getJwtSecret();
    const payload = jwt.verify(accessToken, jwtSecret) as { userId: string };
    req.userId = payload.userId;
    req.sessionId = sessionId;
  } catch {
    // Token invalid, just continue without user
  }
  
  next();
}

export async function requireWorkspaceAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const workspaceId = req.params.workspaceId || req.body.workspaceId;
  if (!workspaceId) {
    res.status(400).json({ error: 'Workspace ID required' });
    return;
  }

  const db = getDb();
  
  const [workspace] = await db.select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));
  
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }

  if (workspace.ownerId === req.userId) {
    req.workspace = workspace;
    req.isWorkspaceOwner = true;
    next();
    return;
  }

  const [membership] = await db.select()
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId),
    eq(schema.workspaceMembers.userId, req.userId!)));

  if (!membership) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  req.workspace = workspace;
  req.isWorkspaceOwner = false;
  req.workspaceRole = (membership.role ?? undefined) as 'owner' | 'admin' | 'member' | 'viewer' | undefined;
  next();
}