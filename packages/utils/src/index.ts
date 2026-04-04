import type { Chat, Message } from '@normie/types';

// Generate UUID v4
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Escape HTML for safe display
export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Format relative time
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Format tool preview
export function formatToolPreview(toolInput: Record<string, unknown>): string {
  if (!toolInput || typeof toolInput !== 'object') {
    return String(toolInput || '').substring(0, 50);
  }

  const keys = Object.keys(toolInput);
  if (keys.length === 0) return '';

  const previewKeys = ['pattern', 'command', 'file_path', 'path', 'query', 'content', 'description'];
  const key = previewKeys.find(k => toolInput[k] !== undefined) || keys[0];
  const value = toolInput[key];

  if (typeof value === 'string') {
    return `${key}: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''}`;
  } else if (Array.isArray(value)) {
    return `${key}: [${value.length} items]`;
  } else if (typeof value === 'object' && value !== null) {
    return `${key}: {...}`;
  }
  return `${key}: ${String(value).substring(0, 30)}`;
}

// Extract browser URL from text
export function extractBrowserUrl(text: string): { url: string; sessionId: string } | null {
  const regex = /https:\/\/live\.anchorbrowser\.io\?sessionId=([a-f0-9-]+)/i;
  const match = text.match(regex);
  if (match) {
    return { url: match[0], sessionId: match[1] };
  }
  return null;
}

// Transform API chat to local format
export function transformApiChat(chatData: Record<string, unknown>): Chat {
  const messages = ((chatData.messages as Record<string, unknown>[]) || []).map((msg): Message => ({
    id: generateId(),
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: String(msg.content || ''),
    html: undefined
  }));
  
  return {
    id: String(chatData.id),
    title: String(chatData.title || 'New chat'),
    provider: String(chatData.provider || 'claude') as Chat['provider'],
    model: String(chatData.model || ''),
    sessionId: chatData.sessionId ? String(chatData.sessionId) : undefined,
    updatedAt: chatData.updatedAt ? new Date(chatData.updatedAt as string).getTime() : Date.now(),
    messages
  };
}
