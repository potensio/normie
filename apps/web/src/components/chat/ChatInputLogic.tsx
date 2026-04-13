/**
 * ChatInputLogic - Logic component that connects to hooks and passes to ChatInput
 *
 * This is a "semi-container" that handles data fetching (providers, preferences, attachments)
 * but receives streaming state from parent container (route).
 */

import { useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/hooks";
import { ChatInput } from "./ChatInput";
import { useProviders, type ModelOption } from "@/hooks/useProviders";
import { useAttachments } from "@/hooks/useAttachments";
import type { Provider } from "@normie/types";

interface StreamOptions {
  chatId: string;
  message: string;
  provider: string;
  model: string;
  workspaceId: string;
  userId: string;
  attachments?: Array<{
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    storagePath: string;
  }>;
}

interface ChatInputLogicProps {
  variant?: "home" | "chat";
  chatId?: string | null;
  isStreaming: boolean;
  startStream: (options: StreamOptions) => Promise<void>;
  stopStream: () => void;
}

export function ChatInputLogic({
  variant = "chat",
  chatId,
  isStreaming,
  startStream,
  stopStream,
}: ChatInputLogicProps) {
  const navigate = useNavigate();
  const { user, currentWorkspace } = useAuth();

  // Preferences
  const {
    provider: selectedProvider,
    model: selectedModel,
    setProvider,
    setModel,
  } = usePreferences();

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
      const targetChatId = chatId || crypto.randomUUID();
      const isNewChat = !chatId;

      // Navigate immediately for new chats (optimistic navigation)
      if (isNewChat) {
        navigate({ to: "/c/$chatId", params: { chatId: targetChatId } });
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

      // Start streaming
      try {
        await startStream({
          message,
          chatId: targetChatId,
          provider: selectedProvider,
          model: selectedModel,
          workspaceId: currentWorkspace?.id || "",
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
      chatId,
      isStreaming,
      user,
      selectedProvider,
      selectedModel,
      currentWorkspace,
      navigate,
      startStream,
      clearAttachments,
      hasAttachments,
      attachments,
    ],
  );

  const handleStop = useCallback(() => {
    stopStream();
  }, [stopStream]);

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
      onStop={handleStop}
      isStreaming={isStreaming}
      isLoadingProviders={isLoading}
      attachments={attachments}
      onAddPaths={handleAddPaths}
      onRemoveAttachment={removeAttachment}
    />
  );
}