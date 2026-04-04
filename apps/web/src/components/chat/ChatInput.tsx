/**
 * ChatInput - Presentational component
 * 
 * Pure UI component for the chat input area.
 */
import { useState, useRef, useCallback } from "react";
import { Send, Paperclip, Plus } from "lucide-react";
import type { Provider } from '@normie/types';

interface ChatInputProps {
  variant?: "home" | "chat";
  
  // Provider/model selection
  selectedProvider: Provider;
  selectedModel: string;
  providers: Provider[];
  models: { value: string; label: string }[];
  providerLabels: Record<Provider, string>;
  onSelectProvider: (provider: Provider) => void;
  onSelectModel: (model: string) => void;
  
  // Actions
  onSend: (message: string) => void;
  onStop: () => void;
  
  // State
  isStreaming: boolean;
}

export function ChatInput({
  variant = "chat",
  selectedProvider,
  selectedModel,
  providers,
  models,
  providerLabels,
  onSelectProvider,
  onSelectModel,
  onSend,
  onStop,
  isStreaming,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (isStreaming) {
        onStop();
        return;
      }

      if (!message.trim()) return;

      onSend(message);
      setMessage("");

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    },
    [message, isStreaming, onStop, onSend],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit],
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  // Find the label for the currently selected model
  const selectedModelLabel = models.find(m => m.value === selectedModel)?.label || selectedModel;

  return (
    <div className={variant === "home" ? "w-full max-w-[680px]" : "p-4"}>
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 flex flex-col gap-3"
      >
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={
            variant === "home" ? "Ask me to build something..." : "Reply..."
          }
          rows={1}
          className="w-full bg-transparent border-none outline-none text-sm font-light text-zinc-900 placeholder-zinc-400 resize-none min-h-[60px]"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center hover:bg-zinc-50 transition-colors text-zinc-500"
            >
              <Paperclip className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center hover:bg-zinc-50 transition-colors text-zinc-500"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <div className="h-5 w-px bg-zinc-200 mx-1" />
            <ProviderSelector
              providers={providers}
              selectedProvider={selectedProvider}
              providerLabels={providerLabels}
              onSelect={onSelectProvider}
              variant={variant}
            />
            <ModelSelector
              models={models}
              selectedModel={selectedModel}
              selectedModelLabel={selectedModelLabel}
              onSelect={onSelectModel}
              variant={variant}
            />
          </div>

          <button
            type="submit"
            disabled={!message.trim() && !isStreaming}
            className="flex items-center gap-2 bg-zinc-950 hover:bg-zinc-800 transition-colors rounded-xl py-2 px-4 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="text-xs font-medium tracking-wide">Send</span>
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================
// Provider Selector (internal dropdown)
// ============================================

interface ProviderSelectorProps {
  providers: Provider[];
  selectedProvider: Provider;
  providerLabels: Record<Provider, string>;
  onSelect: (provider: Provider) => void;
  variant: 'home' | 'chat';
}

function ProviderSelector({
  providers,
  selectedProvider,
  providerLabels,
  onSelect,
}: ProviderSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (provider: Provider) => {
    onSelect(provider);
    setIsOpen(false);
  };

  const getDescription = (provider: Provider) => {
    switch (provider) {
      case 'claude': return 'Claude Agent SDK';
      case 'opencode': return 'Opencode SDK';
      case 'kimi': return 'Kimi API';
      case 'bedrock': return 'AWS Bedrock';
      default: return '';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-cream rounded-lg transition-colors"
      >
        <span>{providerLabels[selectedProvider]}</span>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-44 bg-white border border-gray-200 rounded-xl shadow-dropdown p-2 z-50">
          {providers.map((provider) => (
            <button
              key={provider}
              onClick={() => handleSelect(provider)}
              className={`w-full flex flex-col items-start px-3 py-3 rounded-lg transition-colors text-left ${
                selectedProvider === provider 
                  ? 'bg-cream' 
                  : 'hover:bg-cream'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-sm font-medium text-gray-900">
                  {providerLabels[provider]}
                </span>
                {selectedProvider === provider && (
                  <CheckIcon size={18} className="text-coral" />
                )}
              </div>
              <span className="text-xs text-gray-400 mt-1">
                {getDescription(provider)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Model Selector (internal dropdown)
// ============================================

interface ModelSelectorProps {
  models: { value: string; label: string }[];
  selectedModel: string;
  selectedModelLabel: string;
  onSelect: (model: string) => void;
  variant: 'home' | 'chat';
}

function ModelSelector({
  models,
  selectedModel,
  selectedModelLabel,
  onSelect,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (model: string) => {
    onSelect(model);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-cream rounded-lg transition-colors"
      >
        <span>{selectedModelLabel}</span>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-44 bg-white border border-gray-200 rounded-xl shadow-dropdown p-2 z-50">
          {models.map((model) => (
            <button
              key={model.value}
              onClick={() => handleSelect(model.value)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                selectedModel === model.value 
                  ? 'bg-cream' 
                  : 'hover:bg-cream'
              }`}
            >
              <span className="text-sm text-gray-900">{model.label}</span>
              {selectedModel === model.value && (
                <CheckIcon size={16} className="text-coral" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Need these imports
import { useEffect } from 'react';
import { ChevronDown, Check as CheckIcon } from 'lucide-react';