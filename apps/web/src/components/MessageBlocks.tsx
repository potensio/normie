/**
 * MessageBlocks - Renderer for interleaved message blocks
 *
 * Renders blocks in order: TextBlock → AnimatedStream, ToolBlock → CompactToolCall
 */
import { memo } from "react";
import type { MessageBlock } from "@normie/types";
import { AnimatedStream } from "./chat/AnimatedStream";
import { CompactToolCall } from "./CompactToolCall";

interface MessageBlocksProps {
  blocks: MessageBlock[];
  isStreaming: boolean;
}

export const MessageBlocks = memo(function MessageBlocks({
  blocks,
  isStreaming,
}: MessageBlocksProps) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        const isLastBlock = index === blocks.length - 1;

        if (block.type === "text") {
          return (
            <AnimatedStream
              key={`text-${index}`}
              content={block.content}
              isStreaming={isStreaming && isLastBlock}
            />
          );
        }

        if (block.type === "tool") {
          return (
            <CompactToolCall
              key={`tool-${block.toolCall.id}`}
              toolCall={block.toolCall}
              isStreaming={
                isStreaming &&
                isLastBlock &&
                block.toolCall.status === "running"
              }
            />
          );
        }

        return null;
      })}
    </div>
  );
});