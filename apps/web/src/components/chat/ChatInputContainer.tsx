/**
 * ChatInputContainer - Container component
 * 
 * Connects to context and fetches providers, passes data to presentational ChatInput.
 */

import { useEffect, useMemo, useCallback } from 'react';
import { useChat } from '@/contexts/ChatContext';
import { ChatInput } from './ChatInput';
import { useProviders, type ModelOption } from '@/hooks/useProviders';
import { useAttachments } from '@/hooks/useAttachments';
import type { Provider } from '@normie/types';

export function ChatInputContainer({ variant = "chat" }: { variant?: "home" | "chat" }) {
  const {
    sendMessage,
    stopStreaming,
    isStreaming,
    selectedProvider,
    selectedModel,
    setProvider,
    setModel,
    currentChat,
  } = useChat();

  // Attachment handling
  const { attachments, addFiles, removeFile, clearFiles, hasFiles } = useAttachments();

  // Fetch providers from API
  const { providers, isLoading, getModelsForProvider } = useProviders();

  // Get models for current provider
  const models: ModelOption[] = useMemo(() => {
    return getModelsForProvider(selectedProvider);
  }, [selectedProvider, getModelsForProvider]);

  // Build provider list and labels from API response
  const providerList = useMemo(() => {
    return providers.map(p => p.id as Provider);
  }, [providers]);

  const providerLabels = useMemo(() => {
    return Object.fromEntries(providers.map(p => [p.id, p.name]));
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

  // Handle file selection
  const handleAddFiles = useCallback(async (files: Array<{ path: string; name: string; size: number; type: string; data: string }>) => {
    await addFiles(files);
  }, [addFiles]);

  // Handle send with attachments
  const handleSend = useCallback(async (message: string) => {
    let savedAttachments: Array<{
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      storagePath: string;
    }> | undefined;

    // If we have attachments, save them first
    if (hasFiles && currentChat?.id) {
      // Filter out files with errors
      const validAttachments = attachments.filter(a => !a.error);
      
      if (validAttachments.length > 0) {
        // Convert pending attachments to the format expected by Electron
        const filesToSave = validAttachments.map(a => ({
          data: a.preview || '', // Use preview (data URL) if available
          name: a.file.name,
          type: a.file.type,
          size: a.file.size,
        }));
        
        // Save attachments via Electron IPC
        const result = await window.electronAPI?.saveAttachments(currentChat.id, filesToSave);
        
        if (result?.success && result.attachments) {
          savedAttachments = result.attachments;
          console.log('[ChatInputContainer] Saved attachments:', savedAttachments);
        }
      }
    }
    
    // Send the message with attachments
    sendMessage(message, savedAttachments);
    
    // Clear attachments after sending
    clearFiles();
  }, [sendMessage, clearFiles, hasFiles, attachments, currentChat?.id]);

  // Ensure selected model is valid for the provider when models load (initial load)
  useEffect(() => {
    if (!isLoading && models.length > 0) {
      const modelExists = models.some(m => m.value === selectedModel);
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
      onAddFiles={handleAddFiles}
      onRemoveAttachment={removeFile}
    />
  );
}
