import { useRef, useEffect, useMemo, memo } from "react";
import { marked } from "marked";
import type { Message } from "@normie/types";
import { ThinkingBlock } from "./ThinkingBlock";
import { InlineToolCall } from "./InlineToolCall";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Only auto-scroll if user is near bottom (within 100px)
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      100;

    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Check if last message is being streamed
  const isLastMessageStreaming =
    isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant";

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-6 py-6 space-y-4"
    >
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          isLast={index === messages.length - 1}
          isStreaming={isLastMessageStreaming && index === messages.length - 1}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  isLast: boolean;
  isStreaming: boolean;
}

const MessageItem = memo(function MessageItem({
  message,
  isStreaming,
}: MessageItemProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex flex-col gap-1 items-end">
        <div className="bg-zinc-100 px-4 py-2.5 rounded-2xl max-w-2xl">
          <p className="text-sm font-light text-zinc-900">{message.content}</p>
        </div>
        <span className="text-xs font-light text-zinc-400">2 min ago</span>
      </div>
    );
  }

  // Parse markdown for assistant message content
  const htmlContent = useMemo(() => {
    return message.content
      ? marked.parse(message.content, { breaks: true, gfm: true })
      : "";
  }, [message.content]);

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      {/* Thinking Block - Shows reasoning process */}
      {message.reasoning && (
        <ThinkingBlock
          content={message.reasoning}
          isStreaming={isStreaming && !message.content}
        />
      )}

      {/* Inline Tool Calls - Shown in stream order */}
      {message.inlineToolCalls && message.inlineToolCalls.length > 0 && (
        <div className="space-y-3">
          {message.inlineToolCalls.map((toolCall) => (
            <InlineToolCall key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}

      {/* Main Content */}
      {message.content && (
        <div className="space-y-3">
          <div
            className="markdown-content text-sm font-light text-zinc-900 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
          <span className="text-xs font-light text-zinc-400">Just now</span>
        </div>
      )}

      {/* Empty state when streaming starts */}
      {isStreaming && !message.content && !message.reasoning && (
        <div className="flex items-center gap-2 py-2 text-zinc-400">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-sm font-light">Thinking...</span>
        </div>
      )}
    </div>
  );
});
