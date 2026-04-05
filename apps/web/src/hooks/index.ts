/**
 * Hooks index - re-export all hooks
 * 
 * Usage:
 * import { useChats, useLogin, useWorkspaces } from '@/hooks';
 */

// Auth
export { useLogin, useLogout, useRegister } from './useAuth';

// Chats
export { useChats, useChatDetail, useDeleteChat, chatKeys } from './useChats';
export { useChatStream } from './useChatStream';
export { useChatActions } from './useChatActions';
export { useChatSender } from './useChatSender';
export { useCurrentChat } from './useCurrentChat';
export { useChatNavigation } from './useChatNavigation';

// UI
export { useSmartScroll } from './useSmartScroll';

// Workspaces
export { useWorkspaces, useCreateWorkspace, workspaceKeys } from './useWorkspaces';

// Preferences
export { usePreferences } from './usePreferences';