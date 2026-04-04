import { Hammer, FileCode } from "lucide-react";
import { formatToolPreview } from "@normie/utils";
import type { InlineToolCall as InlineToolCallType } from "@normie/types";

interface InlineToolCallProps {
  toolCall: InlineToolCallType;
}

export function InlineToolCall({ toolCall }: InlineToolCallProps) {
  const preview = formatToolPreview(toolCall.input);

  return (
    <div className="border border-zinc-200 rounded-xl p-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <Hammer className="w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
        <span className="text-xs font-medium text-zinc-600 uppercase tracking-wide">
          Tool Used
        </span>
        <span className="ml-auto rounded-full py-0.5 px-2.5 text-xs font-light bg-zinc-900 text-zinc-100">
          {toolCall.name}
        </span>
      </div>

      <div className="bg-zinc-50 rounded-lg p-3 border border-zinc-100">
        <div className="flex items-start gap-3">
          <FileCode
            className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5"
            strokeWidth={1.5}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-zinc-900 mb-1">
              {preview || "Tool execution"}
            </p>
            {toolCall.result !== undefined && (
              <p className="text-xs font-light text-zinc-600">
                {typeof toolCall.result === "string"
                  ? toolCall.result.substring(0, 100) +
                    (toolCall.result.length > 100 ? "..." : "")
                  : "Completed successfully"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
