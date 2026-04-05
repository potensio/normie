/**
 * StreamingText - Smooth streaming with RAF-throttled markdown parsing
 *
 * Technique from Open WebUI's Markdown.svelte:
 * 
 * 1. Use requestAnimationFrame to throttle markdown parsing
 * 2. Skip parsing if there's already a pending update
 * 3. When streaming ends, parse immediately (no throttle)
 *
 * This prevents multiple markdown parses per animation frame,
 * which is what causes jank during streaming.
 */
import { memo, useRef, useEffect, useState, useCallback } from 'react';
import { marked } from 'marked';

interface StreamingTextProps {
  content: string;
  isStreaming: boolean;
  className?: string;
}

function _StreamingText({ content, isStreaming, className = '' }: StreamingTextProps) {
  const [htmlContent, setHtmlContent] = useState('');
  const pendingUpdateRef = useRef<number | null>(null);
  const lastContentRef = useRef('');
  
  // Parse markdown (expensive operation)
  const parseMarkdown = useCallback((text: string) => {
    if (text === lastContentRef.current) return;
    lastContentRef.current = text;
    
    try {
      const html = marked.parse(text, { breaks: true, gfm: true }) as string;
      setHtmlContent(html);
    } catch (e) {
      console.error('Markdown parse error:', e);
    }
  }, []);
  
  // Throttled update handler - THE KEY TECHNIQUE
  useEffect(() => {
    if (!content) return;
    
    if (!isStreaming) {
      // When done streaming, parse immediately
      if (pendingUpdateRef.current) {
        cancelAnimationFrame(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
      parseMarkdown(content);
    } else if (!pendingUpdateRef.current) {
      // During streaming: only parse if no pending update
      // This throttles to max 1 parse per animation frame
      pendingUpdateRef.current = requestAnimationFrame(() => {
        pendingUpdateRef.current = null;
        parseMarkdown(content);
      });
    }
    // If there IS a pending update, skip - the scheduled one will handle it
    
    return () => {
      if (pendingUpdateRef.current) {
        cancelAnimationFrame(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
    };
  }, [content, isStreaming, parseMarkdown]);

  if (!content && !isStreaming) return null;

  return (
    <div className={className}>
      <div 
        className="markdown-content text-sm font-light text-zinc-900 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
      
      {isStreaming && (
        <span 
          className="inline-block w-0.5 h-4 bg-zinc-400 ml-0.5 align-text-bottom"
          style={{ animation: 'cursorBlink 0.8s step-end infinite' }}
        />
      )}
    </div>
  );
}

export const StreamingText = memo(_StreamingText);