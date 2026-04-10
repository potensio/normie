/**
 * ChatInputContainer - Container component
 *
 * Connects to hooks and fetches providers, passes data to presentational ChatInput.
 */

import { useEffect, useMemo, useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { useChat, usePreferences } from "@/hooks";
import { ChatInput } from "./ChatInput";
import { useProviders, type ModelOption } from "@/hooks/useProviders";
import { useAttachments } from "@/hooks/useAttachments";
import type { Provider } from "@normie/types";

export function ChatInputContainer({
  variant = "chat",
}: {
  variant?: "home" | "chat";
}) {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { user, currentWorkspace } = useAuth();

  // Extract chatId from URL
  const currentChatId = routerState.location.pathname.startsWith("/c/")
    ? routerState.location.pathname.split("/c/")[1]
    : null;

  // Preferences
  const {
    provider: selectedProvider,
    model: selectedModel,
    setProvider,
    setModel,
  } = usePreferences();

  // Send message mutation
  const { mutateAsync: sendMessage, isPending: isStreaming } = useChat();

  // Attachment handling
  const {
    attachments,
    addPaths,
    removeAttachment,
    clearAttachments,
    hasAttachments,
  } = useAttachments();

  // Fetch providers from API
  const { providers, isLoading, getModelsForProvider } = useProviders();

  // Get models for current provider
  const models: ModelOption[] = useMemo(() => {
    return getModelsForProvider(selectedProvider);
  }, [selectedProvider, getModelsForProvider]);

  // Build provider list and labels from API response
  const providerList = useMemo(() => {
    return providers.map((p) => p.id as Provider);
  }, [providers]);

  const providerLabels = useMemo(() => {
    return Object.fromEntries(providers.map((p) => [p.id, p.name]));
  }, [providers]);

  // Handle provider change - auto-select first valid model
  const handleSelectProvider = (provider: Provider) => {
    setProvider(provider);
    // Immediately select first model for the new provider
    const newModels = getModelsForProvider(provider);
    if (newModels.length > 0) {
      setModel(newModels[0].value);
    }
  };

  // Handle path selection (no file reading!)
  const handleAddPaths = useCallback(
    (
      paths: Array<{
        path: string;
        name: string;
        isDirectory: boolean;
        size: number;
      }>,
    ) => {
      addPaths(paths);
    },
    [addPaths],
  );

  // Handle send with attachments
  const handleSend = useCallback(
    async (message: string) => {
      if (!message.trim() || isStreaming || !user?.id) return;

      // Generate chatId if new chat
      const chatId = currentChatId || crypto.randomUUID();
      const isNewChat = !currentChatId;

      // Navigate immediately for new chats (optimistic navigation)
      if (isNewChat) {
        navigate({ to: "/c/$chatId", params: { chatId } });
      }

      // Prepare full attachment data (not just paths!)
      const attachmentData = hasAttachments
        ? attachments.map((a) => ({
            id: a.id,
            filename: a.name,
            originalName: a.name,
            mimeType: a.isDirectory
              ? "inode/directory"
              : "application/octet-stream",
            size: a.size,
            storagePath: a.path,
          }))
        : undefined;

      // Send the message with full attachment data
      try {
        await sendMessage({
          content: message,
          chatId,
          provider: selectedProvider,
          model: selectedModel,
          workspaceId: currentWorkspace?.id || null,
          userId: user.id,
          attachments: attachmentData,
        });
      } catch (error) {
        console.error("[ChatInput] Failed to send message:", error);
        // If it's a new chat and failed, navigate back to home
        if (isNewChat) {
          navigate({ to: "/" });
        }
      }

      // Clear attachments after sending
      clearAttachments();
    },
    [
      currentChatId,
      isStreaming,
      user,
      selectedProvider,
      selectedModel,
      currentWorkspace,
      navigate,
      sendMessage,
      clearAttachments,
      hasAttachments,
      attachments,
    ],
  );

  const stopStreaming = useCallback(() => {
    // No-op for non-streaming
  }, []);

  // Ensure selected model is valid for the provider when models load (initial load)
  useEffect(() => {
    if (!isLoading && models.length > 0) {
      const modelExists = models.some((m) => m.value === selectedModel);
      if (!modelExists) {
        // Pick first model
        setModel(models[0].value);
      }
    }
  }, [isLoading, models, selectedModel, setModel]);

  // Handle loading state - show minimal UI
  if (isLoading && providers.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 text-sm text-zinc-400">
        Loading providers...
      </div>
    );
  }

  // On error, fallback providers will still be used (from useProviders)
  return (
    <ChatInput
      variant={variant}
      selectedProvider={selectedProvider}
      selectedModel={selectedModel}
      providers={providerList}
      models={models}
      providerLabels={providerLabels}
      onSelectProvider={handleSelectProvider}
      onSelectModel={setModel}
      onSend={handleSend}
      onStop={stopStreaming}
      isStreaming={isStreaming}
      isLoadingProviders={isLoading}
      attachments={attachments}
      onAddPaths={handleAddPaths}
      onRemoveAttachment={removeAttachment}
    />
  );
}
