/**
 * ChatInput - Presentational component
 *
 * Pure UI component for the chat input area.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Send,
  Paperclip,
  Square,
  ChevronDown,
  Check as CheckIcon,
  Loader2,
} from "lucide-react";
import type { Provider } from "@normie/types";
import type { ModelOption } from "@/hooks/useProviders";

interface ChatInputProps {
  variant?: "home" | "chat";

  // Provider/model selection
  selectedProvider: Provider;
  selectedModel: string;
  providers: Provider[];
  models: ModelOption[];
  providerLabels: Record<string, string>;
  onSelectProvider: (provider: Provider) => void;
  onSelectModel: (model: string) => void;

  // Actions
  onSend: (message: string) => void;
  onStop: () => void;

  // State
  isStreaming: boolean;
  isLoadingProviders?: boolean;
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
  isLoadingProviders = false,
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
  const selectedModelLabel =
    models.find((m) => m.value === selectedModel)?.label || selectedModel;

  // Find provider description (if available)
  const selectedProviderLabel =
    providerLabels[selectedProvider] || selectedProvider;

  return (
    <div
      className={
        variant === "home"
          ? "w-full max-w-[720px]"
          : "pb-4 max-w-[720px] mx-auto w-full"
      }
    >
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
          className="w-full bg-transparent border-none outline-none text-sm font-light text-zinc-900 placeholder-zinc-400 resize-none min-h-[60px] leading-relaxed"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center hover:bg-zinc-50 transition-colors text-zinc-500"
            >
              <Paperclip className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <div className="h-5 w-px bg-zinc-200 mx-1" />

            {/* Provider Selector */}
            <ProviderSelector
              providers={providers}
              selectedProvider={selectedProvider}
              providerLabels={providerLabels}
              onSelect={onSelectProvider}
              variant={variant}
              isLoading={isLoadingProviders}
            />

            {/* Model Selector */}
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
            title={isStreaming ? "Stop generating" : "Send message"}
            className="flex items-center justify-center w-9 h-9 bg-zinc-950 hover:bg-zinc-800 transition-colors rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStreaming ? (
              <Square className="w-4 h-4 fill-current" strokeWidth={1.5} />
            ) : (
              <Send className="w-4 h-4" strokeWidth={1.5} />
            )}
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
  providerLabels: Record<string, string>;
  onSelect: (provider: Provider) => void;
  variant: "home" | "chat";
  isLoading?: boolean;
}

function ProviderSelector({
  providers,
  selectedProvider,
  providerLabels,
  onSelect,
  isLoading,
}: ProviderSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (provider: Provider) => {
    onSelect(provider);
    setIsOpen(false);
  };

  const selectedLabel = providerLabels[selectedProvider] || selectedProvider;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !isLoading && setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-cream rounded-lg transition-colors disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
        <span>{selectedLabel}</span>
        <ChevronDown
          size={16}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-48 bg-white border border-gray-200 rounded-xl shadow-dropdown p-2 z-50 max-h-64 overflow-y-auto">
          {providers.map((provider) => {
            const label = providerLabels[provider] || provider;
            const isSelected = selectedProvider === provider;

            return (
              <button
                key={provider}
                onClick={() => handleSelect(provider)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                  isSelected ? "bg-cream" : "hover:bg-cream"
                }`}
              >
                <span className="text-start text-sm font-medium text-gray-900 truncate">
                  {label}
                </span>
                {isSelected && <CheckIcon size={16} className="text-coral" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// Model Selector (internal dropdown)
// ============================================

interface ModelSelectorProps {
  models: ModelOption[];
  selectedModel: string;
  selectedModelLabel: string;
  onSelect: (model: string) => void;
  variant: "home" | "chat";
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
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
        <ChevronDown
          size={16}
          className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-48 bg-white border border-gray-200 rounded-xl shadow-dropdown p-2 z-50 max-h-64 overflow-y-auto">
          {models.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">
              No models available
            </div>
          ) : (
            models.map((model) => (
              <button
                key={model.value}
                onClick={() => handleSelect(model.value)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                  selectedModel === model.value ? "bg-cream" : "hover:bg-cream"
                }`}
              >
                <span className="text-start text-sm truncate">
                  {model.label}
                </span>
                {selectedModel === model.value && (
                  <CheckIcon size={16} className="text-coral" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
