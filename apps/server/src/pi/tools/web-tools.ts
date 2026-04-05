import { Type, type Static } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';

/**
 * Web Search Tool Parameters Schema
 */
const WebSearchParams = Type.Object({
  query: Type.String({
    description: 'The search query to look up on the web',
  }),
  count: Type.Optional(
    Type.Number({
      description: 'Maximum number of results to return (1-50, default: 5)',
      minimum: 1,
      maximum: 50,
    }),
  ),
  freshness: Type.Optional(
    Type.String({
      description:
        'Time filter for results: noLimit (default), oneDay, oneWeek, oneMonth',
      enum: ['noLimit', 'oneDay', 'oneWeek', 'oneMonth'],
    }),
  ),
});

type WebSearchParamsType = Static<typeof WebSearchParams>;

/**
 * Web Fetch Tool Parameters Schema
 */
const WebFetchParams = Type.Object({
  url: Type.String({
    description: 'The URL to fetch and extract content from',
  }),
  selector: Type.Optional(
    Type.String({
      description: 'CSS selector to extract specific content from the page',
    }),
  ),
  maxLength: Type.Optional(
    Type.Number({
      description: 'Maximum content length to return in characters (default: 10000)',
      minimum: 100,
      maximum: 50000,
    }),
  ),
});

type WebFetchParamsType = Static<typeof WebFetchParams>;

/**
 * Web Search result item
 */
interface WebSearchResult {
  title: string;
  url: string;
  displayUrl: string;
  snippet: string;
  summary?: string;
}

/**
 * Web Search Tool
 *
 * Searches the web using LangSearch API for current information, documentation,
 * or answers. Returns summarized content in markdown format.
 */
export const webSearchTool: AgentTool<typeof WebSearchParams> = {
  name: 'web_search',
  label: 'Web Search',
  description:
    'Search the web for current information, documentation, news, or research topics. ' +
    'Use this to find up-to-date information that may not be in your training data, ' +
    'or to verify facts and find sources. Returns summarized content from top results.',
  parameters: WebSearchParams,

  execute: async (
    _toolCallId: string,
    params: WebSearchParamsType,
    signal?: AbortSignal,
    onUpdate?: (partial: AgentToolResult<unknown>) => void,
  ): Promise<AgentToolResult<unknown>> => {
    const startTime = Date.now();

    try {
      // Check for abort
      if (signal?.aborted) {
        return {
          content: [
            { type: 'text', text: 'Web search aborted before starting' },
          ],
          details: { aborted: true },
        };
      }

      // Perform the search
      const results = await performWebSearch(
        params.query,
        params.count ?? 5,
        params.freshness ?? 'noLimit',
        signal,
      );

      const executionTime = Date.now() - startTime;

      // Format results for display
      const formattedResults = results
        .map((r, i) => {
          const parts = [
            `${i + 1}. **${r.title}**`,
            `   URL: ${r.url}`,
            `   ${r.snippet}`,
          ];
          if (r.summary) {
            parts.push(`   Summary: ${r.summary.substring(0, 500)}${r.summary.length > 500 ? '...' : ''}`);
          }
          return parts.join('\n');
        })
        .join('\n\n');

      const resultText =
        results.length > 0
          ? `Search results for "${params.query}":\n\n${formattedResults}`
          : `No results found for "${params.query}"`;

      const toolResult: AgentToolResult<unknown> = {
        content: [{ type: 'text', text: resultText }],
        details: {
          query: params.query,
          resultCount: results.length,
          executionTime,
          freshness: params.freshness ?? 'noLimit',
          results: results.map((r) => ({
            title: r.title,
            url: r.url,
          })),
        },
      };

      // Report progress
      onUpdate?.(toolResult);

      return toolResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error('[WebSearch] Search failed:', errorMessage);

      return {
        content: [
          {
            type: 'text',
            text: `Web search failed: ${errorMessage}\n\nPlease try a different query or check your connection.`,
          },
        ],
        details: {
          query: params.query,
          error: errorMessage,
          executionTime,
          success: false,
        },
      };
    }
  },
};

/**
 * Web Fetch Tool
 *
 * Fetches and extracts content from a specific URL. Can optionally use
 * a CSS selector to extract specific content from the page.
 */
export const webFetchTool: AgentTool<typeof WebFetchParams> = {
  name: 'web_fetch',
  label: 'Web Fetch',
  description:
    'Fetch and extract text content from a specific URL. ' +
    'Use this to read full content from web pages found via web_search, ' +
    'documentation pages, articles, or any publicly accessible URL. ' +
    'Optionally use a CSS selector to extract specific content.',
  parameters: WebFetchParams,

  execute: async (
    _toolCallId: string,
    params: WebFetchParamsType,
    signal?: AbortSignal,
    onUpdate?: (partial: AgentToolResult<unknown>) => void,
  ): Promise<AgentToolResult<unknown>> => {
    const startTime = Date.now();

    try {
      // Check for abort
      if (signal?.aborted) {
        return {
          content: [
            { type: 'text', text: 'Web fetch aborted before starting' },
          ],
          details: { url: params.url, aborted: true },
        };
      }

      // Validate URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(params.url);
      } catch {
        return {
          content: [
            { type: 'text', text: `Invalid URL: ${params.url}` },
          ],
          details: {
            url: params.url,
            error: 'Invalid URL format',
            success: false,
          },
        };
      }

      // Fetch the content
      const content = await fetchWebContent(
        parsedUrl.toString(),
        params.selector,
        params.maxLength ?? 10000,
        signal,
      );

      const executionTime = Date.now() - startTime;

      const resultText = `Content from ${params.url}:\n\n${content}`;

      const toolResult: AgentToolResult<unknown> = {
        content: [{ type: 'text', text: resultText }],
        details: {
          url: params.url,
          contentLength: content.length,
          executionTime,
          selector: params.selector,
          success: true,
        },
      };

      // Report progress
      onUpdate?.(toolResult);

      return toolResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error(`[WebFetch] Failed to fetch ${params.url}:`, errorMessage);

      return {
        content: [
          {
            type: 'text',
            text: `Failed to fetch ${params.url}: ${errorMessage}\n\nThe page may not be accessible or may require authentication.`,
          },
        ],
        details: {
          url: params.url,
          error: errorMessage,
          executionTime,
          success: false,
        },
      };
    }
  },
};

/**
 * Perform a web search using LangSearch API
 */
async function performWebSearch(
  query: string,
  count: number,
  freshness: string,
  signal?: AbortSignal,
): Promise<WebSearchResult[]> {
  const apiKey = process.env.LANGSEARCH_API_KEY;

  if (!apiKey) {
    // Return mock results if no API key configured
    console.warn('[WebSearch] No LANGSEARCH_API_KEY configured, returning mock results');
    return [
      {
        title: 'Web Search Not Configured',
        url: 'https://example.com',
        displayUrl: 'example.com',
        snippet: 'Set LANGSEARCH_API_KEY environment variable to enable web search.',
        summary: 'To enable web search, configure the LANGSEARCH_API_KEY environment variable.',
      },
    ];
  }

  const response = await fetch('https://api.langsearch.com/v1/web-search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      count,
      freshness,
      summary: true,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Search API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  // Parse the response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webPages = data.data?.webPages?.value || [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return webPages.map((page: any) => ({
    title: page.name || page.title || 'Untitled',
    url: page.url || page.link,
    displayUrl: page.displayUrl || new URL(page.url || page.link).hostname,
    snippet: page.snippet || page.description || '',
    summary: page.summary,
  }));
}

/**
 * Fetch and extract content from a URL
 */
async function fetchWebContent(
  url: string,
  _selector?: string,
  maxLength: number = 10000,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; NormieBot/1.0; +https://normie.app)',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';

  // Handle text content directly
  if (contentType.includes('text/plain')) {
    const text = await response.text();
    return text.substring(0, maxLength);
  }

  // Parse HTML content
  if (contentType.includes('text/html')) {
    const html = await response.text();

    // Simple HTML to text conversion
    // For production, consider using a proper HTML parser
    let text = html
      // Remove scripts and styles
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Convert block elements to newlines
      .replace(/<\/(p|div|section|article|header|footer|main|aside|nav|li|tr|br)>/gi, '\n')
      .replace(/<(p|div|section|article|header|footer|main|aside|nav|li|tr)[^>]*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Remove remaining tags
      .replace(/<[^>]+>/g, '')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Clean up whitespace
      .replace(/\n\s*\n/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    // Truncate to max length
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '\n\n... (content truncated)';
    }

    return text;
  }

  // For other content types, return info
  return `Content type: ${contentType}\nURL: ${url}\n\nBinary or unsupported content type. Try opening directly in a browser.`;
}
