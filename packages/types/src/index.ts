// Provider types - Pi Agent providers (use string for flexibility)
export type PiProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "groq"
  | "xai"
  | "mistral"
  | "openrouter"
  | "ollama"
  | "amazon-bedrock"
  | "azure-openai-responses";

// Allow any string for extensibility with future providers
export type Provider = PiProvider | string;

// Pi model catalog types
export interface PiModel {
  id: string;           // e.g., 'claude-opus-4-5'
  name: string;         // Display name
  provider: string;     // Provider ID
  contextWindow: number;
  maxTokens: number;
  reasoning?: boolean;  // Supports extended thinking
  cost?: {
    input: number;      // Per 1M tokens
    output: number;
  };
}

export interface PiProviderInfo {
  id: string;           // e.g., 'anthropic'
  name: string;         // Display name 'Anthropic'
  models: PiModel[];
}

export interface ProvidersResponse {
  providers: PiProviderInfo[];
  default: {
    provider: string;
    model: string;
  };
}

// Legacy model types - kept for backward compatibility
export interface Model {
  value: string;
  label: string;
  desc: string;
  default?: boolean;
}

// Provider models mapping - flexible string indexer
export interface ProviderModels {
  [provider: string]: Array<{
    value: string;
    label: string;
    desc?: string;
    default?: boolean;
  }>;
}

// Chat types
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  html?: string;
  toolCalls?: ToolCall[];
  reasoning?: string; // Thinking/reasoning content
  inlineToolCalls?: InlineToolCall[]; // Tool calls displayed inline
}

// Inline tool call within a message
export interface InlineToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: unknown;
}

export interface Chat {
  id: string;
  title: string;
  provider: Provider;
  model: string;
  sessionId?: string;
  updatedAt: number;
  messages: Message[];
  todos?: Todo[];
  toolCalls?: ToolCall[];
  unread?: boolean;
}

// Tool types
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: unknown;
}

export interface Todo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

// Auth types
export interface User {
  id: string;
  email: string;
  displayName?: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
}

// Stream chunk types
// Used for SSE streaming from backend to frontend
export type StreamChunk =
  | { type: "connected"; message: string }
  | { type: "session_init"; session_id: string; provider: string }
  | { type: "text"; content: string; provider: string; isReasoning?: boolean }
  | {
      type: "tool_use";
      name: string;
      input: Record<string, unknown>;
      id: string;
      provider: string;
    }
  | { type: "tool_result"; result: unknown; tool_use_id: string; provider: string }
  | { type: "done"; provider: string }
  | { type: "error"; message: string; provider?: string }
  | { type: "aborted"; provider: string }
  | { type: "title_update"; title: string };

// Legacy interface for backwards compatibility
// Deprecated: Use the StreamChunk union type directly
export interface StreamChunkLegacy {
  type:
    | "connected"
    | "session_init"
    | "text"
    | "tool_use"
    | "tool_result"
    | "done"
    | "error"
    | "aborted"
    | "title_update";
  provider?: string;
  session_id?: string;
  content?: string;
  name?: string;
  input?: Record<string, unknown> | string;
  id?: string;
  result?: unknown;
  tool_use_id?: string;
  isReasoning?: boolean;
  message?: string;
  title?: string;
}

// File attachment
export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  data: string;
}

// Thinking mode
export type ThinkingMode = "normal" | "extended";

// Browser session
export interface BrowserSession {
  url: string;
  sessionId: string;
}
