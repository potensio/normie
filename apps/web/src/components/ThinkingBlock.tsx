/**
 * ThinkingBlock - Collapsible reasoning display
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Brain } from 'lucide-react';

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({
  content,
  isStreaming = false,
}: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(isStreaming);
  
  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
    }
  }, [isStreaming]);

  if (!content && !isStreaming) return null;

  const lines = content.split('\n').filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50/50"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-3 px-4 py-3 w-full hover:bg-zinc-100/50 transition-colors text-left"
      >
        <motion.div
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
        </motion.div>
        
        <div className="p-1.5 rounded-lg bg-purple-100">
          <Brain className="w-4 h-4 text-purple-600" strokeWidth={1.5} />
        </div>
        
        <span className="text-sm font-medium text-zinc-700">Thinking</span>
        
        {isStreaming && (
          <div className="ml-auto flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 bg-purple-500 rounded-full"
                animate={{ y: [0, -3, 0] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.1,
                }}
              />
            ))}
          </div>
        )}
        
        {!isStreaming && lines.length > 0 && (
          <span className="text-xs text-zinc-400 ml-auto">
            {lines.length} lines
          </span>
        )}
      </button>
      
      <AnimatePresence initial={false}>
        {isExpanded && content && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-zinc-200/50">
              <div className="text-sm font-light text-zinc-600 leading-relaxed whitespace-pre-wrap">
                {content}
              </div>
              {isStreaming && (
                <span 
                  className="inline-block w-0.5 h-4 bg-purple-400 ml-0.5 mt-2"
                  style={{ animation: 'cursorBlink 0.8s step-end infinite' }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}