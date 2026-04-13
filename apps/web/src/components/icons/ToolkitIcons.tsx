/**
 * Toolkit Icons
 *
 * Icons for common Composio toolkits.
 * Uses Lucide icons with fallback to a generic Puzzle icon.
 */

import {
  Mail,
  Calendar,
  MessageSquare,
  Github,
  FileText,
  CircleDot,
  Trello,
  FolderOpen,
  Users,
  Puzzle,
  type LucideIcon,
} from 'lucide-react';

export interface ToolkitIconProps {
  /** Toolkit slug (e.g., 'gmail', 'slack', 'github') */
  slug: string;
  /** Icon size */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
};

/**
 * Map of toolkit slugs to their icons.
 */
export const TOOLKIT_ICONS: Record<string, LucideIcon> = {
  // Communication
  gmail: Mail,
  outlook: Mail,
  email: Mail,
  slack: MessageSquare,
  discord: MessageSquare,
  microsoft_teams: Users,

  // Calendar
  google_calendar: Calendar,
  calendar: Calendar,

  // Development
  github: Github,
  gitlab: Github,
  bitbucket: Github,

  // Project Management
  notion: FileText,
  linear: CircleDot,
  jira: Trello,
  asana: Trello,
  trello: Trello,

  // Storage
  google_drive: FolderOpen,
  dropbox: FolderOpen,
  onedrive: FolderOpen,
};

/**
 * Get brand colors for toolkits.
 */
export const TOOLKIT_COLORS: Record<string, string> = {
  // Google
  gmail: 'text-red-500',
  google_calendar: 'text-blue-500',
  google_drive: 'text-yellow-500',

  // Communication
  slack: 'text-purple-500',
  discord: 'text-indigo-500',
  microsoft_teams: 'text-blue-600',
  outlook: 'text-blue-500',

  // Development
  github: 'text-gray-700 dark:text-gray-300',
  gitlab: 'text-orange-500',
  linear: 'text-indigo-500',
  jira: 'text-blue-500',

  // Productivity
  notion: 'text-gray-700 dark:text-gray-300',
  asana: 'text-red-500',
  trello: 'text-blue-400',
};

/**
 * Render a toolkit-specific icon with fallback.
 */
export function ToolkitIcon({
  slug,
  size = 'md',
  className = '',
}: ToolkitIconProps): JSX.Element {
  const Icon = TOOLKIT_ICONS[slug] || Puzzle;
  const sizeClass = sizeMap[size];
  const colorClass = TOOLKIT_COLORS[slug] || 'text-gray-500';

  return <Icon className={`${sizeClass} ${colorClass} ${className}`} />;
}

/**
 * Get the Lucide icon component for a toolkit.
 * Useful for custom rendering.
 */
export function getToolkitIcon(slug: string): LucideIcon {
  return TOOLKIT_ICONS[slug] || Puzzle;
}

/**
 * Get the color class for a toolkit.
 */
export function getToolkitColor(slug: string): string {
  return TOOLKIT_COLORS[slug] || 'text-gray-500';
}

/**
 * Check if a toolkit has a custom icon.
 */
export function hasToolkitIcon(slug: string): boolean {
  return slug in TOOLKIT_ICONS;
}