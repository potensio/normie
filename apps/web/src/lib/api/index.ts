/**
 * API Module Index
 * 
 * Re-exports all API clients for convenient imports.
 * 
 * @example
 * import { authApi, chatApi, workspaceApi } from '@/lib/api';
 * 
 * // Login
 * await authApi.login(email, password);
 * 
 * // Get chats
 * const chats = await chatApi.list(workspaceId);
 */

export { authApi } from './auth';
export { chatApi, type ApiChat } from './chat';
export { workspaceApi } from './workspace';
export { providersApi, type ProvidersResponse } from './providers';
export { apiRequest, ApiClientError, type ApiError, type RequestOptions } from './client';
