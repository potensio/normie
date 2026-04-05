/**
 * MessageList - Renders chat messages with smart auto-scroll
 */
import type { Message } from "@normie/types";
import { MessageItem } from "./MessageItem";
import { useSmartScroll } from "@/hooks";
import { ScrollToBottomButton } from "./ScrollToBottomButton";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  // Smart scroll - only auto-scrolls when user is near bottom
  const { containerRef, bottomRef, showScrollButton, scrollToBottom } = useSmartScroll(
    [messages, isStreaming]
  );

  // Check if last message is being streamed
  const isLastMessageStreaming =
    isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant";

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-6 py-6 space-y-4"
      >
        {messages.map((message, index) => (
          <MessageItem
            key={message.id}
            message={message}
            isStreaming={
              isLastMessageStreaming && index === messages.length - 1
            }
          />
        ))}
        <div ref={bottomRef} />
      </div>
      
      {/* Scroll to bottom button */}
      <ScrollToBottomButton 
        visible={showScrollButton} 
        onClick={scrollToBottom} 
      />
    </div>
  );
}