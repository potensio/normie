/**
 * AnimatedStream - Flowtoken-style smooth streaming animation
 * 
 * Based on Flowtoken's approach:
 * https://github.com/Ephibbs/flowtoken
 * 
 * Key concepts:
 * 1. Use ReactMarkdown with custom text renderer
 * 2. SplitText component tokenizes by "diff" mode - only new text gets animated
 * 3. Each token gets CSS animation with inline styles
 * 
 * Animation config:
 * - Duration: 0.6s (as requested)
 * - Timing: ease-in-out (as requested)
 * - Separator: per character (as requested)
 */
import { memo, useRef, useEffect, useMemo, useCallback, ReactElement, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface AnimatedStreamProps {
  content: string;
  isStreaming: boolean;
  className?: string;
}

// Animation config
const ANIMATION_DURATION = '0.6s';
const ANIMATION_TIMING = 'ease-in-out';
const ANIMATION_NAME = 'ft-slideUp'; // Using slideUp for smoother effect

/**
 * TokenizedText - The core Flowtoken approach
 * 
 * For streaming, we use "diff" mode:
 * - Track previous input
 * - Only NEW content gets wrapped in animated spans
 * - Old content is rendered without animation (performance)
 */
interface TokenWithSource {
  text: string;
  source: number;
}

type TokenType = string | TokenWithSource | ReactElement;

interface TokenizedTextProps {
  input: string;
  sep: 'diff' | 'word' | 'char';
  animation: string;
  animationDuration: string;
  animationTimingFunction: string;
  animationIteratonCount?: number;
}

function TokenizedText({ 
  input, 
  sep, 
  animation, 
  animationDuration, 
  animationTimingFunction 
}: TokenizedTextProps) {
  // Track previous input for diff mode
  const prevInputRef = useRef<string>('');
  const tokensWithSourcesRef = useRef<TokenWithSource[]>([]);
  const fullTextRef = useRef<string>('');

  const tokens = useMemo(() => {
    if (typeof input !== 'string') return [];

    // For diff mode - key for streaming!
    if (sep === 'diff') {
      // Reset if content shrank (new message)
      if (!prevInputRef.current || input.length < prevInputRef.current.length) {
        tokensWithSourcesRef.current = [];
        fullTextRef.current = '';
      }

      // Only process if input changed
      if (input !== prevInputRef.current) {
        // Find new content by comparing with tracked text
        if (input.includes(fullTextRef.current)) {
          const uniqueNewContent = input.slice(fullTextRef.current.length);

          if (uniqueNewContent.length > 0) {
            tokensWithSourcesRef.current.push({
              text: uniqueNewContent,
              source: tokensWithSourcesRef.current.length
            });
            fullTextRef.current = input;
          }
        } else {
          // Content completely changed
          tokensWithSourcesRef.current = [{
            text: input,
            source: 0
          }];
          fullTextRef.current = input;
        }
      }

      return tokensWithSourcesRef.current;
    }

    // For char mode - split by character
    if (sep === 'char') {
      return input.split('').filter(t => t.length > 0);
    }

    // For word mode
    return input.split(/(\s+)/).filter(t => t.length > 0);
  }, [input, sep]);

  useEffect(() => {
    if (typeof input === 'string') {
      prevInputRef.current = input;
    }
  }, [input]);

  const isTokenWithSource = (token: TokenType): token is TokenWithSource => {
    return token !== null && typeof token === 'object' && 'text' in token && 'source' in token;
  };

  return (
    <>
      {tokens.map((token, index) => {
        let key = index;
        let text = '';

        if (isTokenWithSource(token)) {
          key = token.source;
          text = token.text;
        } else if (typeof token === 'string') {
          key = index;
          text = token;
        } else if (isValidElement(token)) {
          return token;
        }

        return (
          <span 
            key={key} 
            style={{
              animationName: animation,
              animationDuration,
              animationTimingFunction,
              animationIterationCount: 1,
              whiteSpace: 'pre-wrap',
              display: 'inline-block',
            }}
          >
            {text}
          </span>
        );
      })}
    </>
  );
}

/**
 * AnimatedStream main component
 */
function _AnimatedStream({ content, isStreaming, className = '' }: AnimatedStreamProps) {
  // Animate text function - wraps text in TokenizedText
  const animateText = useCallback((text: string | Array<any>) => {
    const input = Array.isArray(text) ? text.join('') : text;

    if (!isStreaming) {
      // When not streaming, just return plain text (no animation)
      if (typeof input === 'string') return input;
      return text;
    }

    if (typeof input !== 'string') return text;

    return (
      <TokenizedText
        input={input}
        sep="diff"
        animation={ANIMATION_NAME}
        animationDuration={ANIMATION_DURATION}
        animationTimingFunction={ANIMATION_TIMING}
      />
    );
  }, [isStreaming]);

  // Custom components for ReactMarkdown
  const components = useMemo(() => ({
    text: ({ children }: any) => animateText(children),
    p: ({ children }: any) => <p>{isStreaming ? animateText(children as string) : children}</p>,
    h1: ({ children }: any) => <h1>{isStreaming ? animateText(children as string) : children}</h1>,
    h2: ({ children }: any) => <h2>{isStreaming ? animateText(children as string) : children}</h2>,
    h3: ({ children }: any) => <h3>{isStreaming ? animateText(children as string) : children}</h3>,
    li: ({ children }: any) => <li>{isStreaming ? animateText(children as string) : children}</li>,
    strong: ({ children }: any) => <strong>{isStreaming ? animateText(children as string) : children}</strong>,
    em: ({ children }: any) => <em>{isStreaming ? animateText(children as string) : children}</em>,
    code: ({ className: codeClassName, children, inline }: any) => {
      if (inline) {
        return <code className={codeClassName}>{isStreaming ? animateText(children as string) : children}</code>;
      }
      return (
        <pre className={codeClassName}>
          <code>{isStreaming ? animateText(children as string) : children}</code>
        </pre>
      );
    },
    a: ({ href, children }: any) => (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {isStreaming ? animateText(children as string) : children}
      </a>
    ),
  }), [animateText, isStreaming]);

  if (!content && !isStreaming) return null;

  return (
    <div className={className}>
      <div className="markdown-content text-sm font-light text-zinc-900 leading-relaxed">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]} 
          rehypePlugins={[rehypeRaw]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
      
      {isStreaming && (
        <span className="streaming-cursor-coral" />
      )}
    </div>
  );
}

export const AnimatedStream = memo(_AnimatedStream);