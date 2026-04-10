/**
 * AnimatedStream - Simple streaming without memo or throttling
 *
 * NEW APPROACH:
 * - No memo - render immediately on every prop change
 * - No RAF throttling - let React handle batching
 * - Trust that backend sends small chunks frequently
 */
import { MarkdownRenderer } from "./MarkdownRenderer";

interface AnimatedStreamProps {
  content: string;
  isStreaming: boolean;
  className?: string;
}

export function AnimatedStream({
  content,
  isStreaming,
  className = "",
}: AnimatedStreamProps) {
  // For completed messages, use the full MarkdownRenderer
  if (!isStreaming) {
    return (
      <div className={className}>
        <MarkdownRenderer content={content} />
      </div>
    );
  }

  // For streaming, render immediately with cursor
  return (
    <div className={className}>
      <div className="streaming-markdown animate-fade-in-subtle">
        <MarkdownRenderer content={content} />
      </div>
      <span className="streaming-cursor-coral" />
    </div>
  );
}
