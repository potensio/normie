/**
 * InlineToolCall - Displays tool execution with status and expandable result
 *
 * Features:
 * - Status indicators (running/success/error) with colors and animations
 * - Tool-specific icons based on category
 * - Collapsible result section
 * - Smooth animations via framer-motion
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { InlineToolCall as InlineToolCallType } from '@normie/types';
import { getToolMeta, getCategoryColor } from '@/lib/tool-icons';
import { formatToolPreview } from '@normie/utils';

interface InlineToolCallProps {
  toolCall: InlineToolCallType;
}

export function InlineToolCall({ toolCall }: InlineToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(toolCall.status === 'running');
  
  const { name, input, status, result } = toolCall;
  const meta = getToolMeta(name);
  const categoryColor = getCategoryColor(meta.category);
  const preview = formatToolPreview(input);
  
  const Icon = meta.icon;
  const StatusIcon = status === 'running' ? Loader2 : 
                     status === 'success' ? CheckCircle : XCircle;
  
  // Status-specific styles
  const statusStyles = {
    running: {
      container: 'border-amber-300 bg-amber-50/50',
      badge: 'bg-amber-500 text-white',
      icon: 'text-amber-500 animate-spin',
    },
    success: {
      container: 'border-emerald-300 bg-emerald-50/50',
      badge: 'bg-emerald-500 text-white',
      icon: 'text-emerald-500',
    },
    error: {
      container: 'border-red-300 bg-red-50/50',
      badge: 'bg-red-500 text-white',
      icon: 'text-red-500',
    },
  };
  
  const styles = statusStyles[status];
  
  // Format result for display
  const resultText = typeof result === 'string' 
    ? result 
    : result !== undefined 
      ? JSON.stringify(result, null, 2) 
      : null;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`border rounded-xl overflow-hidden ${styles.container}`}
    >
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-3 px-4 py-3 w-full hover:bg-black/[0.02] transition-colors text-left"
      >
        {/* Expand arrow */}
        <ChevronRight
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${
            isExpanded ? 'rotate-90' : ''
          }`}
          strokeWidth={1.5}
        />
        
        {/* Tool icon with category color */}
        <div className={`p-1.5 rounded-lg ${categoryColor.bg}`}>
          <Icon className={`w-4 h-4 ${categoryColor.text}`} strokeWidth={1.5} />
        </div>
        
        {/* Tool label and name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-900">
              {meta.label}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${styles.badge}`}>
              {name}
            </span>
          </div>
          {preview && (
            <p className="text-xs text-zinc-500 mt-0.5 truncate">
              {preview}
            </p>
          )}
        </div>
        
        {/* Status icon */}
        <StatusIcon 
          className={`w-5 h-5 ${styles.icon}`} 
          strokeWidth={1.5}
        />
      </button>
      
      {/* Expandable result section */}
      <AnimatePresence initial={false}>
        {isExpanded && resultText && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-zinc-200/50">
              <p className="text-xs font-medium text-zinc-500 mb-2">Result</p>
              <pre className="text-xs font-mono text-zinc-700 bg-zinc-100 rounded-lg p-3 overflow-x-auto max-h-60 overflow-y-auto">
                {resultText.length > 2000 
                  ? resultText.substring(0, 2000) + '\n... (truncated)'
                  : resultText
                }
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Running state - show pulsing indicator */}
      {status === 'running' && !isExpanded && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-amber-600">
            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-xs font-light">Running...</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}