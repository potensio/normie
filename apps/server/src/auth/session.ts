import { randomBytes } from 'crypto';
import { eq, and, gt, lt } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';

// ============================================
// SESSION MANAGEMENT (HTTP-ONLY COOKIES)
// ============================================

export interface SessionData {
  id: string;
  userId: string;
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
  createdAt: Date;
}

// Session cookie config
export const SESSION_COOKIE_NAME = 'sessionId';
export const ACCESS_TOKEN_COOKIE = 'accessToken';

// 7 days for session
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// 15 minutes for access token
export const ACCESS_TOKEN_DURATION = '15m';

export async function createSession(
  userId: string, 
  userAgent?: string, 
  ipAddress?: string
): Promise<{ sessionId: string; expiresAt: Date }> {
  const db = getDb();
  
  // Generate secure session ID
  const sessionId = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  
  await db.insert(schema.sessions).values({
    id: sessionId,
    userId,
    userAgent,
    ipAddress,
    expiresAt
  });
  
  return { sessionId, expiresAt };
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  if (!sessionId) return null;
  
  const db = getDb();
  const now = new Date();
  
  const [session] = await db.select()
    .from(schema.sessions)
    .where(and(
      eq(schema.sessions.id, sessionId),
      gt(schema.sessions.expiresAt, now)
    ));
  
  if (!session) return null;
  
  return {
    id: session.id,
    userId: session.userId,
    userAgent: session.userAgent || undefined,
    ipAddress: session.ipAddress || undefined,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt || new Date()
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  
  const db = getDb();
  await db.delete(schema.sessions)
    .where(eq(schema.sessions.id, sessionId));
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  const db = getDb();
  await db.delete(schema.sessions)
    .where(eq(schema.sessions.userId, userId));
}

export async function cleanupExpiredSessions(): Promise<void> {
  const db = getDb();
  const now = new Date();
  
  // Delete expired sessions
  await db.delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, now));
}

// Cookie options for session
export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_DURATION_MS
  };
}

export function getAccessTokenCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 15 * 60 * 1000 // 15 minutes
  };
}