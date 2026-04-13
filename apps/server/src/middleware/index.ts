/**
 * Middleware Exports
 *
 * Usage:
 *   import { errorHandler, asyncHandler, NotFoundError, requireChat } from '../middleware/index.js';
 */

// Error handling
export {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  ServiceUnavailableError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
} from "./errors.js";

// Resource access
export {
  loadWorkspace,
  requireWorkspaceAccess,
  requireWorkspaceWriteAccess,
  requireWorkspaceOwner,
  loadChat,
  requireChatAccess,
  requireChatWriteAccess,
  requireChat,
  requireChatWrite,
} from "./resource-access.js";
