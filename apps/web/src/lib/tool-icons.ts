/**
 * Tool icon mapping and categorization
 *
 * Maps tool names to appropriate icons and categories for better UX.
 */
import {
  FileText,
  FilePlus,
  FileEdit,
  Terminal,
  Search,
  Globe,
  FolderOpen,
  Image,
  Database,
  Mail,
  Calendar,
  MessageSquare,
  Code,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type ToolCategory = 
  | 'file' 
  | 'shell' 
  | 'search' 
  | 'browser' 
  | 'communication' 
  | 'data' 
  | 'utility'
  | 'unknown';

export interface ToolMeta {
  icon: LucideIcon;
  category: ToolCategory;
  label: string;
}

// Tool name patterns to meta mapping
const toolPatterns: Array<{
  pattern: RegExp;
  meta: ToolMeta;
}> = [
  // File operations
  { pattern: /^read$/i, meta: { icon: FileText, category: 'file', label: 'Read file' } },
  { pattern: /^write$/i, meta: { icon: FilePlus, category: 'file', label: 'Write file' } },
  { pattern: /^edit$/i, meta: { icon: FileEdit, category: 'file', label: 'Edit file' } },
  { pattern: /^create.*file/i, meta: { icon: FilePlus, category: 'file', label: 'Create file' } },
  { pattern: /^delete.*file/i, meta: { icon: FileText, category: 'file', label: 'Delete file' } },
  { pattern: /^file.*/i, meta: { icon: FileText, category: 'file', label: 'File operation' } },
  
  // Shell/Command
  { pattern: /^bash$/i, meta: { icon: Terminal, category: 'shell', label: 'Run command' } },
  { pattern: /^shell$/i, meta: { icon: Terminal, category: 'shell', label: 'Shell' } },
  { pattern: /^execute$/i, meta: { icon: Terminal, category: 'shell', label: 'Execute' } },
  { pattern: /^run/i, meta: { icon: Terminal, category: 'shell', label: 'Run' } },
  
  // Search
  { pattern: /^grep$/i, meta: { icon: Search, category: 'search', label: 'Search in files' } },
  { pattern: /^find$/i, meta: { icon: Search, category: 'search', label: 'Find' } },
  { pattern: /^search$/i, meta: { icon: Search, category: 'search', label: 'Search' } },
  { pattern: /^glob$/i, meta: { icon: FolderOpen, category: 'search', label: 'Find files' } },
  
  // Browser
  { pattern: /^browser/i, meta: { icon: Globe, category: 'browser', label: 'Browser' } },
  { pattern: /^navigate$/i, meta: { icon: Globe, category: 'browser', label: 'Navigate' } },
  { pattern: /^click$/i, meta: { icon: Globe, category: 'browser', label: 'Click' } },
  { pattern: /^screenshot$/i, meta: { icon: Image, category: 'browser', label: 'Screenshot' } },
  
  // Communication
  { pattern: /^mail$/i, meta: { icon: Mail, category: 'communication', label: 'Email' } },
  { pattern: /^email$/i, meta: { icon: Mail, category: 'communication', label: 'Email' } },
  { pattern: /^calendar$/i, meta: { icon: Calendar, category: 'communication', label: 'Calendar' } },
  { pattern: /^slack$/i, meta: { icon: MessageSquare, category: 'communication', label: 'Slack' } },
  
  // Data
  { pattern: /^database$/i, meta: { icon: Database, category: 'data', label: 'Database' } },
  { pattern: /^query$/i, meta: { icon: Database, category: 'data', label: 'Query' } },
  
  // Utility
  { pattern: /^todo/i, meta: { icon: Wrench, category: 'utility', label: 'Todo' } },
  { pattern: /^code.*analy/i, meta: { icon: Code, category: 'utility', label: 'Analyze code' } },
];

/**
 * Get tool metadata (icon, category, label) from tool name
 */
export function getToolMeta(toolName: string): ToolMeta {
  for (const { pattern, meta } of toolPatterns) {
    if (pattern.test(toolName)) {
      return meta;
    }
  }
  
  // Default fallback
  return {
    icon: Wrench,
    category: 'unknown',
    label: formatToolLabel(toolName),
  };
}

/**
 * Format tool name into a readable label
 */
function formatToolLabel(toolName: string): string {
  // Convert camelCase/PascalCase to spaces
  const spaced = toolName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  
  // Capitalize first letter
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Get category color classes
 */
export function getCategoryColor(category: ToolCategory): {
  bg: string;
  text: string;
  border: string;
} {
  switch (category) {
    case 'file':
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-600',
        border: 'border-blue-200',
      };
    case 'shell':
      return {
        bg: 'bg-zinc-100',
        text: 'text-zinc-700',
        border: 'border-zinc-300',
      };
    case 'search':
      return {
        bg: 'bg-purple-50',
        text: 'text-purple-600',
        border: 'border-purple-200',
      };
    case 'browser':
      return {
        bg: 'bg-cyan-50',
        text: 'text-cyan-600',
        border: 'border-cyan-200',
      };
    case 'communication':
      return {
        bg: 'bg-orange-50',
        text: 'text-orange-600',
        border: 'border-orange-200',
      };
    case 'data':
      return {
        bg: 'bg-indigo-50',
        text: 'text-indigo-600',
        border: 'border-indigo-200',
      };
    case 'utility':
      return {
        bg: 'bg-zinc-50',
        text: 'text-zinc-600',
        border: 'border-zinc-200',
      };
    default:
      return {
        bg: 'bg-zinc-50',
        text: 'text-zinc-600',
        border: 'border-zinc-200',
      };
  }
}