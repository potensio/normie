/**
 * Hooks index - re-export all hooks
 *
 * Usage:
 * import { useChats, useLogin, useWorkspaces } from '@/hooks';
 */

// Auth
export { useLogin, useLogout, useRegister } from "./useAuth";

// Chats
export {
  useChats,
  useCurrentChat,
  useChatDelete,
  useChatSender,
  chatKeys,
} from "./useChats";
export { useChatStream } from "./useChatStream";

// UI
export { useSmartScroll } from "./useSmartScroll";

// Workspaces
export {
  useWorkspaces,
  useCreateWorkspace,
  workspaceKeys,
} from "./useWorkspaces";

// Preferences
export { usePreferences } from "./usePreferences";

// Providers
export {
  useProviders,
  providerKeys,
  type ModelOption,
  type UseProvidersReturn,
} from "./useProviders";

// API Keys
export {
  useApiKeys,
  useSaveApiKey,
  useDeleteApiKey,
  apiKeyKeys,
  type ApiKeyInfo,
} from "./useApiKeys";
