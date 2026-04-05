/**
 * AnimatedStream - Flowtoken-style smooth streaming animation
 * 
 * DEPRECATED: This component is too complex and causes jank.
 * Use MarkdownRenderer for completed messages and a simpler
 * streaming approach for live text.
 * 
 * For now, this is a thin wrapper that falls back to MarkdownRenderer
 * for completed messages and shows a simple animated text for streaming.
 */
import { memo, useRef, useEffect, useState, useCallback } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AnimatedStreamProps {
  content: string;
  isStreaming: boolean;
  className?: string;
}

function _AnimatedStream({ content, isStreaming, className = '' }: AnimatedStreamProps) {
  // For completed messages, use the full MarkdownRenderer
  if (!isStreaming) {
    return (
      <div className={className}>
        <MarkdownRenderer content={content} />
      </div>
    );
  }

  // For streaming, use simple fade-in animation on new content
  return (
    <div className={className}>
      <StreamingMarkdown content={content} />
      <span className="streaming-cursor-coral" />
    </div>
  );
}

/**
 * StreamingMarkdown - Simplified streaming with RAF-throttled updates
 */
function StreamingMarkdown({ content }: { content: string }) {
  const [displayContent, setDisplayContent] = useState(content);
  const rafRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Throttle updates to 60fps using RAF
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      setDisplayContent(content);
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [content]);

  return (
    <div 
      ref={containerRef}
      className="streaming-markdown animate-fade-in-subtle"
    >
      <MarkdownRenderer content={displayContent} />
    </div>
  );
}

export const AnimatedStream = memo(_AnimatedStream);