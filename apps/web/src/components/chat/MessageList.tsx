/**
 * MessageList - Renders chat messages with smart auto-scroll
 */
import type { Message } from "@normie/types";
import { Loader } from "lucide-react";
import { MessageItem } from "./MessageItem";
import { useSmartScroll } from "@/hooks";
import { ScrollToBottomButton } from "./ScrollToBottomButton";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  chatId?: string;
}

export function MessageList({ messages, isStreaming, chatId }: MessageListProps) {
  // Smart scroll - only auto-scrolls when user is near bottom
  // Also scrolls to bottom when chatId changes (switching conversations)
  const { containerRef, bottomRef, showScrollButton, scrollToBottom } =
    useSmartScroll([messages, isStreaming], { chatId });

  // Check if last message is being streamed
  const isLastMessageStreaming =
    isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant";

  return (
    <div className="relative flex-1 overflow-hidden">
      <div ref={containerRef} className="h-full overflow-y-auto px-6 py-6">
        <div className="max-w-[720px] mx-auto space-y-4 px-4">
          {messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              isStreaming={
                isLastMessageStreaming && index === messages.length - 1
              }
            />
          ))}
          {/* Streaming loader indicator */}
          {isStreaming && (
            <div className="py-2">
              <Loader className="h-4 w-4 animate-spin text-muted-foreground" style={{ animationDuration: "0.5s" }} />
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scroll to bottom button */}
      <ScrollToBottomButton
        visible={showScrollButton}
        onClick={scrollToBottom}
      />
    </div>
  );
}
