import { useState } from "react";
import { ChevronRight } from "lucide-react";

interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({
  content,
  isStreaming: _isStreaming = false,
}: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-4 py-2.5 w-full hover:bg-zinc-50 transition-colors"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${
            isExpanded ? "rotate-90" : ""
          }`}
          strokeWidth={1.5}
        />
        <span className="text-xs font-medium text-zinc-600 uppercase tracking-wide">
          Thinking
        </span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-2 text-sm font-light text-zinc-700 leading-relaxed border-t border-zinc-100 pt-3">
          {content.split("\n").map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
