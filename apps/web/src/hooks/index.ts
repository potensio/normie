/**
 * Hooks index - re-export all hooks
 *
 * Usage:
 * import { useChats, useLogin, useWorkspaces } from '@/hooks';
 */

// Auth
export { useLogin, useLogout, useRegister } from "./useAuth";

// Chats
export { useChats, useChatDelete } from "./useChats";
export { useCurrentChat } from "./useCurrentChat";
export { useChat } from "./useChat";

// UI
export { useSmartScroll } from "./useSmartScroll";

// Preferences
export { usePreferences } from "./usePreferences";

// Providers
export {
  useProviders,
  type ModelOption,
  type UseProvidersReturn,
} from "./useProviders";

// API Keys
export {
  useApiKeys,
  useSaveApiKey,
  useDeleteApiKey,
  type ApiKeyInfo,
} from "./useApiKeys";
