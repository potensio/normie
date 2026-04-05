/**
 * useSmartScroll - Intelligent auto-scroll for chat messages
 *
 * Tracks user scroll intent and only auto-scrolls when appropriate.
 * Shows a "scroll to bottom" button when new content arrives while scrolled up.
 */
import { useRef, useState, useEffect, useCallback } from 'react';

interface UseSmartScrollOptions {
  /** Threshold in pixels to consider "near bottom" */
  threshold?: number;
  /** Debounce delay in ms for scroll events */
  debounceMs?: number;
}

interface UseSmartScrollReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  bottomRef: React.RefObject<HTMLDivElement>;
  shouldAutoScroll: boolean;
  showScrollButton: boolean;
  scrollToBottom: () => void;
}

export function useSmartScroll(
  dependencies: unknown[],
  options: UseSmartScrollOptions = {}
): UseSmartScrollReturn {
  const { threshold = 100, debounceMs = 50 } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const lastScrollTop = useRef(0);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle scroll events to detect user intent
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold;

      // User scrolled up (scrollTop decreased) and not near bottom
      if (scrollTop < lastScrollTop.current && !isNearBottom) {
        setShouldAutoScroll(false);
        setShowScrollButton(true);
      }

      // User scrolled to bottom
      if (isNearBottom) {
        setShouldAutoScroll(true);
        setShowScrollButton(false);
      }

      lastScrollTop.current = scrollTop;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  // Auto-scroll when dependencies change (e.g., messages update)
  useEffect(() => {
    if (!shouldAutoScroll) return;

    // Clear any pending scroll
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }

    // Debounce the scroll to avoid jank during rapid updates
    scrollTimeout.current = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, debounceMs);

    return () => {
      if (scrollTimeout.current) {
        clearTimeout(scrollTimeout.current);
      }
    };
  }, [shouldAutoScroll, ...dependencies, debounceMs]);

  // Manual scroll to bottom
  const scrollToBottom = useCallback(() => {
    setShouldAutoScroll(true);
    setShowScrollButton(false);
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  return {
    containerRef,
    bottomRef,
    shouldAutoScroll,
    showScrollButton,
    scrollToBottom,
  };
}