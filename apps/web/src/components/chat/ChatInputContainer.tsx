/**
 * ChatInputContainer - Container component
 * 
 * Connects to context and fetches providers, passes data to presentational ChatInput.
 */

import { useEffect, useMemo } from 'react';
import { useChat } from '@/contexts/ChatContext';
import { ChatInput } from './ChatInput';
import { useProviders, type ModelOption } from '@/hooks/useProviders';
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
  } = useChat();

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
      onSend={sendMessage}
      onStop={stopStreaming}
      isStreaming={isStreaming}
      isLoadingProviders={isLoading}
    />
  );
}
