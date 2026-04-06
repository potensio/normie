/**
 * ToolResultViewer - Pretty-printed tool result display
 *
 * Features:
 * - Syntax highlighting for JSON
 * - Max height with scroll
 * - Plain text fallback for non-JSON
 */
import { useState, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ToolResultViewerProps {
  result: unknown;
  maxHeight?: number;
}

export function ToolResultViewer({
  result,
  maxHeight = 200,
}: ToolResultViewerProps) {
  const [formattedResult, setFormattedResult] = useState<string>("");
  const [isJSON, setIsJSON] = useState(false);

  useEffect(() => {
    if (result === null || result === undefined) {
      setFormattedResult("null");
      setIsJSON(true);
      return;
    }

    // Try to format as JSON
    try {
      const parsed =
        typeof result === "string" ? JSON.parse(result) : result;
      setFormattedResult(JSON.stringify(parsed, null, 2));
      setIsJSON(true);
    } catch {
      // Not JSON, display as plain text
      setFormattedResult(String(result));
      setIsJSON(false);
    }
  }, [result]);

  if (isJSON) {
    return (
      <SyntaxHighlighter
        language="json"
        style={oneLight}
        customStyle={{
          margin: 0,
          maxHeight: `${maxHeight}px`,
          overflowY: "auto",
          fontSize: "12px",
          borderRadius: "8px",
        }}
      >
        {formattedResult}
      </SyntaxHighlighter>
    );
  }

  return (
    <pre
      className="text-xs font-mono text-zinc-700 bg-zinc-100 rounded-lg p-3 overflow-auto"
      style={{ maxHeight: `${maxHeight}px` }}
    >
      {formattedResult}
    </pre>
  );
}