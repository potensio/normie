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
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-1 items-end"
      >
        <div className="bg-zinc-100 px-4 py-2.5 rounded-2xl max-w-2xl">
          <p className="text-sm font-light text-zinc-900">{message.content}</p>
        </div>
        <span className="text-xs font-light text-zinc-400">2 min ago</span>
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
        <div className="space-y-3">
          <AnimatedStream 
            content={message.content}
            isStreaming={isStreaming}
          />
          {!isStreaming && (
            <span className="text-xs font-light text-zinc-400">Just now</span>
          )}
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
                className="w-2 h-2 bg-zinc-400 rounded-full"
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
        </motion.div>
      )}
    </motion.div>
  );
});