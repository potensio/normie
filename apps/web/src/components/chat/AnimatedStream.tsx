/**
 * AnimatedStream - Clean streaming text display
 *
 * Renders markdown content with a blinking cursor during streaming.
 * Uses a simple text cursor (█) that blinks via CSS animation.
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
  // For completed messages, render without cursor
  if (!isStreaming) {
    return (
      <div className={className}>
        <MarkdownRenderer content={content} />
      </div>
    );
  }

  // For streaming, append a blinking cursor character
  // This ensures it appears inline with the text
  const contentWithCursor = content + " █";

  return (
    <div className={className}>
      <div className="streaming-text">
        <MarkdownRenderer content={contentWithCursor} />
      </div>
    </div>
  );
}
