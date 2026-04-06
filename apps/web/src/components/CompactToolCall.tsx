/**
 * CompactToolCall - Minimal tool call display
 *
 * Features:
 * - 1-2 line display with status, action, target
 * - Click to expand/collapse result
 * - Duration shown on completion
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import type { InlineToolCall } from "@normie/types";
import {
  getToolLabel,
  getToolTarget,
  truncateTarget,
} from "@/lib/tool-labels";
import { ToolResultViewer } from "./ToolResultViewer";

interface CompactToolCallProps {
  toolCall: InlineToolCall;
  isStreaming: boolean;
}

export function CompactToolCall({
  toolCall,
  isStreaming,
}: CompactToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { name, status, duration, errorMessage, result } = toolCall;
  const label = getToolLabel(name);
  const rawTarget = getToolTarget(name, toolCall.input);
  const target = truncateTarget(rawTarget);

  // Status config
  const statusConfig = {
    running: {
      icon: Loader2,
      iconClass: "text-amber-500 animate-spin",
      text: `${label.verb} ${target}...`,
      textClass: "text-zinc-600",
      prefix: "⏳",
    },
    success: {
      icon: CheckCircle,
      iconClass: "text-emerald-500",
      text: `${label.pastTense} ${target}`,
      textClass: "text-zinc-700",
      prefix: "✓",
      duration: duration !== undefined ? `${duration}s` : undefined,
    },
    error: {
      icon: XCircle,
      iconClass: "text-red-500",
      text: `${label.pastTense} ${target}`,
      textClass: "text-zinc-700",
      prefix: "✗",
    },
  };

  const config = statusConfig[status];
  const hasResult = result !== undefined;
  const showError = status === "error" && errorMessage;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-lg overflow-hidden"
    >
      {/* Main row - clickable if has result */}
      <button
        onClick={() => hasResult && setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-3 py-2 w-full text-left transition-colors ${
          hasResult ? "hover:bg-zinc-100 cursor-pointer" : "cursor-default"
        }`}
        disabled={!hasResult}
      >
        {/* Expand arrow (only if has result) */}
        {hasResult && (
          <ChevronRight
            className={`w-3 h-3 text-zinc-400 transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            }`}
          />
        )}

        {/* Status prefix */}
        <span
          className={`text-sm ${
            status === "success"
              ? "text-emerald-600"
              : status === "error"
                ? "text-red-500"
                : "text-amber-500"
          }`}
        >
          {config.prefix}
        </span>

        {/* Text */}
        <span className={`text-sm ${config.textClass} flex-1`}>
          {config.text}
        </span>

        {/* Duration */}
        {status === "success" && duration !== undefined && (
          <span className="text-xs text-zinc-400">{duration}s</span>
        )}
      </button>

      {/* Error message */}
      {showError && (
        <div className="px-3 pb-2 pt-0.5">
          <p className="text-xs text-red-600 pl-5">{errorMessage}</p>
        </div>
      )}

      {/* Expandable result */}
      <AnimatePresence initial={false}>
        {isExpanded && hasResult && status !== "error" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1">
              <ToolResultViewer result={result} maxHeight={200} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}