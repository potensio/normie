/**
 * MessageItem - Individual message rendering with animations
 *
 * Streaming: Text accumulates via RAF-batched updates for smooth 60fps appearance.
 */
import { useMemo, memo } from "react";
import { motion } from "framer-motion";
import type { Message } from "@normie/types";
import { ThinkingBlock } from "../ThinkingBlock";
import { InlineToolCall } from "../InlineToolCall";
import { AnimatedStream } from "./AnimatedStream";

// Format relative time (e.g., "Just now", "2m ago", "1h ago")
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 10) return "Just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
}

export const MessageItem = memo(function MessageItem({
  message,
  isStreaming = false,
}: MessageItemProps) {
  const isUser = message.role === "user";

  // Generate a stable timestamp for this message instance
  const timestamp = useMemo(() => new Date(), []);

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-0.5 items-end"
      >
        {/* Glass container wrapper - more compact */}
        <div className="inline-block p-1 pb-0.5 rounded-2xl bg-white/40 border border-white/60 shadow-glass">
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 px-3.5 py-2 rounded-2xl max-w-2xl border border-purple-400/50 shadow-purple">
            <p className="text-sm font-normal text-white leading-relaxed">
              {message.content}
            </p>
          </div>
        </div>
        <span className="text-xs font-light text-text-tertiary mr-1.5">
          {formatRelativeTime(timestamp)}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3 max-w-3xl"
    >
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

      {/* Main Content - smooth streaming text */}
      {message.content && (
        <div>
          <AnimatedStream content={message.content} isStreaming={isStreaming} />
        </div>
      )}

      {/* Empty state when streaming starts - bouncing dots */}
      {isStreaming && !message.content && !message.reasoning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 py-1"
        >
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-purple-500 rounded-full"
                animate={{ y: [0, -4, 0] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
          <span className="sr-only">Generating response. Click the stop button in the input to cancel.</span>
        </motion.div>
      )}
    </motion.div>
  );
});
