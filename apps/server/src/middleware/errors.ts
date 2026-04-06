/**
 * Centralized Error Handling
 * 
 * Provides consistent error responses and structured logging across all routes.
 * 
 * Usage:
 *   import { AppError, NotFoundError, ForbiddenError } from '../middleware/errors.js';
 *   
 *   if (!chat) throw new NotFoundError('Chat');
 *   if (!membership) throw new ForbiddenError('Access denied');
 */

import type { Request, Response, NextFunction } from 'express';

// ============================================
// Error Classes
// ============================================

/**
 * Base application error with HTTP status code and error code
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
    
    // Maintains proper stack trace for where error was thrown (only in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Resource not found (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Authentication required (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Access denied (403)
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Conflict error (409) - e.g., duplicate resource
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

/**
 * Service unavailable (503)
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

// ============================================
// Error Handler Middleware
// ============================================

/**
 * Global error handler - must be registered after all routes
 * 
 * Usage in index.ts:
 *   app.use(errorHandler);
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error with context
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR';
  
  console.error(`[ERROR] ${req.method} ${req.path}`, {
    statusCode,
    code,
    message: err.message,
    userId: req.userId,
    sessionId: req.sessionId,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
  });

  // Send consistent response
  if (err instanceof AppError) {
    res.status(statusCode).json({
      error: err.message,
      code: err.code
    });
    return;
  }

  // Unknown error - don't leak internal details in production
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    code: 'INTERNAL_ERROR'
  });
}

// ============================================
// Async Handler Wrapper
// ============================================

/**
 * Wrap async route handlers to catch errors and pass to errorHandler
 * 
 * Without asyncHandler:
 *   router.get('/users', async (req, res, next) => {
 *     try {
 *       const users = await getUsers();
 *       res.json(users);
 *     } catch (err) {
 *       next(err);
 *     }
 *   });
 * 
 * With asyncHandler:
 *   router.get('/users', asyncHandler(async (req, res) => {
 *     const users = await getUsers();
 *     res.json(users);
 *   }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ============================================
// Not Found Handler
// ============================================

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND'
  });
}