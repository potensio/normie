import { useState, useRef, useCallback } from "react";
import { Send, Paperclip, Plus } from "lucide-react";
import { useChat } from "@/contexts/ChatContext";
import { ProviderDropdown } from "./ProviderDropdown";
import { ModelDropdown } from "./ModelDropdown";

interface ChatInputProps {
  variant?: "home" | "chat";
}

export function ChatInput({ variant = "chat" }: ChatInputProps) {
  const { sendMessage, isStreaming, stopStreaming } = useChat();
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (isStreaming) {
        stopStreaming();
        return;
      }

      if (!message.trim()) return;

      await sendMessage(message);
      setMessage("");

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    },
    [message, isStreaming, stopStreaming, sendMessage],
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
            <ProviderDropdown variant={variant} />
            <ModelDropdown variant={variant} />
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
