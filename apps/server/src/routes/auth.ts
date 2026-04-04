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

const router = Router();

// ============================================
// REGISTRATION
// ============================================
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

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
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Email already registered') {
      return res.status(409).json({ error: message });
    }
    console.error('[AUTH] Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ============================================
// LOGIN
// ============================================
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    const result = await login(email, password, userAgent, ipAddress);
    
    // Set cookies
    res.cookie('sessionId', result.sessionId, getSessionCookieOptions());
    res.cookie('accessToken', result.accessToken, getAccessTokenCookieOptions());
    
    res.json({ 
      user: result.user,
      expiresIn: result.expiresIn 
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Invalid credentials') {
      return res.status(401).json({ error: message });
    }
    console.error('[AUTH] Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============================================
// REFRESH TOKEN
// ============================================
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.sessionId as string | undefined;
    
    if (!sessionId) {
      return res.status(401).json({ error: 'No session', code: 'NO_SESSION' });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const result = await refreshAuth(sessionId, ipAddress);
    
    if (!result) {
      // Session invalid or expired
      res.clearCookie('sessionId');
      res.clearCookie('accessToken');
      return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
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
      
      return res.json({ 
        user,
        expiresIn: result.expiresIn 
      });
    }
    
    res.json({ expiresIn: result.expiresIn });
  } catch (err) {
    console.error('[AUTH] Refresh failed:', err);
    res.status(401).json({ error: 'Refresh failed' });
  }
});

// ============================================
// LOGOUT
// ============================================
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.sessionId as string | undefined;
    
    if (sessionId) {
      await logout(sessionId);
    }
    
    // Clear cookies
    res.clearCookie('sessionId', getSessionCookieOptions());
    res.clearCookie('accessToken', getAccessTokenCookieOptions());
    
    res.json({ success: true });
  } catch (err) {
    console.error('[AUTH] Logout error:', err);
    // Still clear cookies
    res.clearCookie('sessionId');
    res.clearCookie('accessToken');
    res.json({ success: true });
  }
});

router.post('/logout-all', requireAuth, async (req: Request, res: Response) => {
  try {
    await logoutAll(req.userId!);
    
    res.clearCookie('sessionId');
    res.clearCookie('accessToken');
    
    res.json({ success: true });
  } catch (err) {
    console.error('[AUTH] Logout all error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ============================================
// GET CURRENT USER
// ============================================
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
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
      return res.status(404).json({ error: 'User not found' });
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
  } catch (err) {
    console.error('[AUTH] Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

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
router.post('/accept-invite/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const db = getDb();

    const [invite] = await db.select()
      .from(schema.workspaceInvites)
      .where(eq(schema.workspaceInvites.token, token));

    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite token' });
    }

    if (new Date() > invite.expiresAt) {
      return res.status(400).json({ error: 'Invite expired' });
    }

    let user: SafeUser | undefined = await getUserByEmail(invite.inviteeEmail);
    
    if (!user) {
      const { password, displayName } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Password required for new account' });
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
  } catch (err) {
    console.error('[AUTH] Accept invite error:', err);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

export default router;