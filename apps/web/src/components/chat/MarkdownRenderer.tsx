/**
 * MarkdownRenderer - Professional markdown rendering for chat messages
 *
 * Based on best practices from:
 * - Open WebUI (content rendering pipeline)
 * - Lobe Chat (shadcn-prose integration)
 * - Jan (RenderMarkdown.tsx composition)
 *
 * Features:
 * - GitHub Flavored Markdown (tables, strikethrough, task lists)
 * - Syntax highlighting with Prism (all languages)
 * - Copy-to-clipboard for code blocks
 * - Responsive tables with overflow
 * - Proper typography hierarchy
 * - Dark mode support
 */
import { useState, useCallback, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

// Copy-to-clipboard code block component
const CodeBlock = memo(function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [code]);

  return (
    <div className="code-block-wrapper my-4 rounded-lg overflow-hidden border border-black/10">
      {/* Header with language and copy button */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#f6f8fa] border-b border-black/10">
        <span className="text-xs font-normal text-zinc-600 uppercase tracking-wide">
          {language || "text"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-normal text-zinc-600 
                     hover:bg-zinc-200/50 hover:text-zinc-900 transition-colors"
          aria-label={copied ? "Copied!" : "Copy code"}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-600">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content */}
      <div className="max-h-[600px] overflow-auto">
        <SyntaxHighlighter
          language={language || "text"}
          style={oneLight}
          customStyle={{
            margin: 0,
            padding: "1rem",
            fontSize: "0.875rem",
            lineHeight: "1.6",
            background: "#ffffff",
          }}
          codeTagProps={{
            style: {
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
});

// Generate heading ID for anchor links
function generateHeadingId(children: React.ReactNode): string {
  const text = String(children).toLowerCase();
  return text
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className = "",
}: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings with anchor IDs
          h1: ({ children, ...props }) => {
            const id = generateHeadingId(children);
            return (
              <h1
                id={id}
                className="text-2xl font-medium leading-tight mt-6 mb-3 text-zinc-900 tracking-tight"
                {...props}
              >
                {children}
              </h1>
            );
          },
          h2: ({ children, ...props }) => {
            const id = generateHeadingId(children);
            return (
              <h2
                id={id}
                className="text-xl font-medium leading-tight mt-5 mb-3 text-zinc-900 tracking-tight border-b border-zinc-200 pb-2"
                {...props}
              >
                {children}
              </h2>
            );
          },
          h3: ({ children, ...props }) => {
            const id = generateHeadingId(children);
            return (
              <h3
                id={id}
                className="text-lg font-medium leading-tight mt-4 mb-2 text-zinc-900 tracking-tight"
                {...props}
              >
                {children}
              </h3>
            );
          },
          h4: ({ children, ...props }) => (
            <h4
              className="text-base font-medium leading-tight mt-4 mb-2 text-zinc-900"
              {...props}
            >
              {children}
            </h4>
          ),
          h5: ({ children, ...props }) => (
            <h5
              className="text-sm font-medium leading-tight mt-3 mb-2 text-zinc-900"
              {...props}
            >
              {children}
            </h5>
          ),
          h6: ({ children, ...props }) => (
            <h6
              className="text-xs font-medium leading-tight mt-3 mb-2 text-zinc-500 uppercase tracking-wider"
              {...props}
            >
              {children}
            </h6>
          ),

          // Paragraphs - light weight as base
          p: ({ children, ...props }) => (
            <p
              className="my-3 text-sm leading-[1.7] text-text-primary font-light"
              {...props}
            >
              {children}
            </p>
          ),

          // Lists - consistent with paragraph styling
          ul: ({ children, ...props }) => (
            <ul className="my-3 pl-5 list-disc space-y-1.5" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="my-3 pl-5 list-decimal space-y-1.5" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li
              className="text-sm leading-[1.7] text-text-primary marker:text-text-tertiary font-light"
              {...props}
            >
              {children}
            </li>
          ),

          // Task lists (GFM)
          input: ({ checked, ...props }) => (
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="mr-2 h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              {...props}
            />
          ),

          // Code blocks and inline code
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            const language = match ? match[1] : "";
            const code = String(children).replace(/\n$/, "");

            // Block code (has language or multiple lines)
            if (language || code.includes("\n")) {
              return <CodeBlock language={language} code={code} />;
            }

            // Inline code
            return (
              <code
                className="px-1.5 py-0.5 text-[0.85em] font-mono rounded bg-surface-secondary text-text-primary border border-border-light"
                {...props}
              >
                {children}
              </code>
            );
          },

          pre: ({ children }) => <>{children}</>,

          // Blockquotes
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="my-3 pl-4 border-l-2 border-purple-500 italic text-text-secondary bg-purple-50/30 py-2 rounded-r"
              {...props}
            >
              {children}
            </blockquote>
          ),

          // Links
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              className="text-coral hover:underline underline-offset-2 decoration-coral/50"
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
              {...props}
            >
              {children}
            </a>
          ),

          // Images
          img: ({ src, alt, ...props }) => (
            <img
              src={src}
              alt={alt}
              className="my-4 max-w-full h-auto rounded-lg shadow-sm"
              loading="lazy"
              {...props}
            />
          ),

          // Horizontal rule
          hr: () => <hr className="my-6 border-zinc-200" />,

          // Tables (GFM)
          table: ({ children, ...props }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-zinc-200">
              <table
                className="min-w-full divide-y divide-zinc-200 text-sm"
                {...props}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-zinc-50" {...props}>
              {children}
            </thead>
          ),
          tbody: ({ children, ...props }) => (
            <tbody className="divide-y divide-zinc-200 bg-white" {...props}>
              {children}
            </tbody>
          ),
          tr: ({ children, ...props }) => (
            <tr className="hover:bg-zinc-50/50 transition-colors" {...props}>
              {children}
            </tr>
          ),
          th: ({ children, ...props }) => (
            <th
              className="px-4 py-3 text-left text-xs font-medium text-zinc-600 uppercase tracking-wider"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td
              className="px-4 py-3 text-zinc-800 whitespace-nowrap"
              {...props}
            >
              {children}
            </td>
          ),

          // Strikethrough (GFM)
          del: ({ children, ...props }) => (
            <del className="line-through text-zinc-500" {...props}>
              {children}
            </del>
          ),

          // Strong and emphasis - decreased by one level
          strong: ({ children, ...props }) => (
            <strong className="font-medium text-zinc-900" {...props}>
              {children}
            </strong>
          ),
          em: ({ children, ...props }) => (
            <em className="italic" {...props}>
              {children}
            </em>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
