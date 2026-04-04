/**
 * ChatInputContainer - Container component
 * 
 * Connects to context and passes data to presentational ChatInput.
 */
import { useMemo } from 'react';
import { useChat } from '@/contexts/ChatContext';
import { ChatInput } from './ChatInput';
import { PROVIDER_MODELS, PROVIDER_LABELS } from '@/lib/constants';
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

  // Get available providers and models
  const providers: Provider[] = useMemo(() => 
    Object.keys(PROVIDER_MODELS) as Provider[],
    []
  );

  const models = useMemo(() => 
    PROVIDER_MODELS[selectedProvider] || [],
    [selectedProvider]
  );

  return (
    <ChatInput
      variant={variant}
      selectedProvider={selectedProvider}
      selectedModel={selectedModel}
      providers={providers}
      models={models}
      providerLabels={PROVIDER_LABELS}
      onSelectProvider={setProvider}
      onSelectModel={setModel}
      onSend={sendMessage}
      onStop={stopStreaming}
      isStreaming={isStreaming}
    />
  );
}