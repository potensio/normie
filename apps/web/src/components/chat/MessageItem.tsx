import { useMemo, memo } from "react";
import { marked } from "marked";
import type { Message } from "@normie/types";
import { ThinkingBlock } from "../ThinkingBlock";
import { InlineToolCall } from "../InlineToolCall";

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
}

export const MessageItem = memo(function MessageItem({
  message,
  isStreaming = false,
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
