import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import {
  register,
  login,
  refreshAuth,
  logout,
  logoutAll,
  requireAuth,
  getUserByEmail,
  createUser,
  generateAccessToken,
  type SafeUser
} from '../auth/index.js';
import {
  getSession,
  getSessionCookieOptions,
  getAccessTokenCookieOptions,
  SESSION_DURATION_MS
} from '../auth/session.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  ValidationError,
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  asyncHandler
} from '../middleware/index.js';

const router = Router();

// ============================================
// REGISTRATION
// ============================================
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, displayName } = req.body;
  
  if (!email || !password) {
    throw new ValidationError('Email and password required');
  }
  
  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  const userAgent = req.headers['user-agent'];
  const ipAddress = req.ip || req.socket.remoteAddress;

  try {
    const result = await register(email, password, displayName, userAgent, ipAddress);
    
    // Set session cookie (http-only, long-lived)
    res.cookie('sessionId', result.sessionId, getSessionCookieOptions());
    
    // Set access token cookie (http-only, short-lived)
    res.cookie('accessToken', result.accessToken, getAccessTokenCookieOptions());
    
    res.json({ 
      user: result.user,
      expiresIn: result.expiresIn 
    });
  } catch (err) {
    if ((err as Error).message === 'Email already registered') {
      throw new ConflictError('Email already registered');
    }
    throw err;
  }
}));

// ============================================
// LOGIN
// ============================================
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    throw new ValidationError('Email and password required');
  }

  const userAgent = req.headers['user-agent'];
  const ipAddress = req.ip || req.socket.remoteAddress;

  try {
    const result = await login(email, password, userAgent, ipAddress);
    
    // Set cookies
    res.cookie('sessionId', result.sessionId, getSessionCookieOptions());
    res.cookie('accessToken', result.accessToken, getAccessTokenCookieOptions());
    
    res.json({ 
      user: result.user,
      expiresIn: result.expiresIn 
    });
  } catch (err) {
    if ((err as Error).message === 'Invalid credentials') {
      throw new UnauthorizedError('Invalid credentials');
    }
    throw err;
  }
}));

// ============================================
// REFRESH TOKEN
// ============================================
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const sessionId = req.cookies?.sessionId as string | undefined;
  
  if (!sessionId) {
    throw new UnauthorizedError('No session');
  }

  const ipAddress = req.ip || req.socket.remoteAddress;
  const result = await refreshAuth(sessionId, ipAddress);
  
  if (!result) {
    // Session invalid or expired
    res.clearCookie('sessionId');
    res.clearCookie('accessToken');
    throw new UnauthorizedError('Session expired');
  }
  
  // Set new access token
  res.cookie('accessToken', result.accessToken, getAccessTokenCookieOptions());
  
  // Return user info
  const session = await getSession(sessionId);
  if (session) {
    const db = getDb();
    const [user] = await db.select({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      createdAt: schema.users.createdAt
    }).from(schema.users).where(eq(schema.users.id, session.userId));
    
    res.json({ 
      user,
      expiresIn: result.expiresIn 
    });
    return;
  }
  
  res.json({ expiresIn: result.expiresIn });
}));

// ============================================
// LOGOUT
// ============================================
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const sessionId = req.cookies?.sessionId as string | undefined;
  
  if (sessionId) {
    await logout(sessionId);
  }
  
  // Clear cookies
  res.clearCookie('sessionId', getSessionCookieOptions());
  res.clearCookie('accessToken', getAccessTokenCookieOptions());
  
  res.json({ success: true });
}));

router.post('/logout-all', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  await logoutAll(req.userId!);
  
  res.clearCookie('sessionId');
  res.clearCookie('accessToken');
  
  res.json({ success: true });
}));

// ============================================
// GET CURRENT USER
// ============================================
router.get('/me', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const db = getDb();
  const [user] = await db.select({
    id: schema.users.id,
    email: schema.users.email,
    displayName: schema.users.displayName,
    createdAt: schema.users.createdAt,
    lastLoginAt: schema.users.lastLoginAt
  })
    .from(schema.users)
    .where(eq(schema.users.id, req.userId!));

  if (!user) {
    throw new NotFoundError('User');
  }

  // Get user's workspaces
  const workspaces = await db.select({
    id: schema.workspaces.id,
    name: schema.workspaces.name,
    description: schema.workspaces.description,
    isDefault: schema.workspaces.isDefault,
    createdAt: schema.workspaces.createdAt
  })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.ownerId, req.userId!));

  res.json({ ...user, workspaces });
}));

// ============================================
// CHECK AUTH STATUS
// ============================================
router.get('/status', async (req: Request, res: Response) => {
  const sessionId = req.cookies?.sessionId as string | undefined;
  
  if (!sessionId) {
    return res.json({ authenticated: false });
  }
  
  const session = await getSession(sessionId);
  
  if (!session) {
    res.clearCookie('sessionId');
    res.clearCookie('accessToken');
    return res.json({ authenticated: false });
  }
  
  // Check if access token is valid
  const accessToken = req.cookies?.accessToken as string | undefined;
  
  res.json({
    authenticated: true,
    userId: session.userId,
    accessTokenValid: !!accessToken // Client should refresh if this is false
  });
});

// ============================================
// INVITE ACCEPTANCE
// ============================================
router.post('/accept-invite/:token', asyncHandler(async (req: Request, res: Response) => {
  const token = req.params.token;
  if (Array.isArray(token)) {
    throw new ValidationError('Invalid token');
  }
  const db = getDb();

  const [invite] = await db.select()
    .from(schema.workspaceInvites)
    .where(eq(schema.workspaceInvites.token, token));

  if (!invite) {
    throw new NotFoundError('Invite token');
  }

  if (new Date() > invite.expiresAt) {
    throw new ValidationError('Invite expired');
  }

  let user: SafeUser | undefined = await getUserByEmail(invite.inviteeEmail);
  
  if (!user) {
    const { password, displayName } = req.body;
    if (!password) {
      throw new ValidationError('Password required for new account');
    }
    user = await createUser(invite.inviteeEmail, password, displayName || null);
  }

  await db.insert(schema.workspaceMembers)
    .values({
      workspaceId: invite.workspaceId,
      userId: user.id,
      role: invite.role
    });

  await db.delete(schema.workspaceInvites)
    .where(eq(schema.workspaceInvites.id, invite.id));

  // Create session
  const userAgent = req.headers['user-agent'];
  const ipAddress = req.ip || req.socket.remoteAddress;
  const { createSession } = await import('../auth/session.js');
  const { sessionId } = await createSession(user.id, userAgent, ipAddress);
  const accessToken = generateAccessToken(user.id);
  
  res.cookie('sessionId', sessionId, getSessionCookieOptions());
  res.cookie('accessToken', accessToken, getAccessTokenCookieOptions());
  
  res.json({
    user: { id: user.id, email: user.email, displayName: user.displayName }
  });
}));

export default router;