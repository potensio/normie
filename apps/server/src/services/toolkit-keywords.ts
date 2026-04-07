/**
 * Toolkit Keyword Mappings
 *
 * Static mappings of keywords to Composio toolkits for intent detection.
 * Used by intent-detector.ts to suggest connections for unconnected toolkits.
 */

export interface ToolkitKeywordMapping {
  toolkitSlug: string;
  toolkitName: string;
  keywords: string[];
  description: string;
  actions: string[];
  logo?: string;
}

/**
 * Known toolkit mappings for intent detection.
 * Ordered by likelihood of use (most common first).
 */
export const TOOLKIT_KEYWORD_MAPPINGS: ToolkitKeywordMapping[] = [
  {
    toolkitSlug: 'gmail',
    toolkitName: 'Gmail',
    keywords: [
      'email',
      'mail',
      'gmail',
      'send email',
      'e-mail',
      'inbox',
      'compose',
    ],
    description: 'Send and manage emails through Gmail',
    actions: [
      'Send an email',
      'Search emails',
      'Get unread count',
      'Reply to emails',
    ],
    logo: 'gmail',
  },
  {
    toolkitSlug: 'google_calendar',
    toolkitName: 'Google Calendar',
    keywords: [
      'calendar',
      'schedule',
      'meeting',
      'event',
      'appointment',
      'google calendar',
      'gcal',
    ],
    description: 'Manage calendar events and schedules',
    actions: [
      'Create calendar event',
      'List upcoming events',
      'Find free time slots',
      'Update event details',
    ],
    logo: 'google-calendar',
  },
  {
    toolkitSlug: 'slack',
    toolkitName: 'Slack',
    keywords: [
      'slack',
      'slack channel',
      'slack message',
      'dm team',
      'message team',
      'team chat',
      'workspace message',
    ],
    description: 'Send and manage Slack messages',
    actions: [
      'Send a message',
      'List channels',
      'Get user info',
      'Search messages',
    ],
    logo: 'slack',
  },
  {
    toolkitSlug: 'github',
    toolkitName: 'GitHub',
    keywords: [
      'github',
      'repo',
      'repository',
      'issue',
      'pull request',
      'pr',
      'commit',
      'branch',
      'merge',
      'code review',
    ],
    description: 'Manage GitHub repositories, issues, and pull requests',
    actions: [
      'Create an issue',
      'List repositories',
      'Create pull request',
      'Review code',
      'Search code',
    ],
    logo: 'github',
  },
  {
    toolkitSlug: 'notion',
    toolkitName: 'Notion',
    keywords: [
      'notion',
      'notion page',
      'wiki',
      'documentation',
      'notes',
      'database entry',
    ],
    description: 'Create and manage Notion pages and databases',
    actions: [
      'Create a page',
      'Search pages',
      'Update database entries',
      'Add content to page',
    ],
    logo: 'notion',
  },
  {
    toolkitSlug: 'linear',
    toolkitName: 'Linear',
    keywords: [
      'linear',
      'linear issue',
      'ticket',
      'bug report',
      'feature request',
      'task tracking',
      'sprint',
    ],
    description: 'Manage Linear issues and projects',
    actions: [
      'Create an issue',
      'Update issue status',
      'Assign issue',
      'Search issues',
    ],
    logo: 'linear',
  },
  {
    toolkitSlug: 'jira',
    toolkitName: 'Jira',
    keywords: [
      'jira',
      'jira ticket',
      'jira issue',
      'epic',
      'story',
      'board',
      'backlog',
    ],
    description: 'Manage Jira issues and projects',
    actions: [
      'Create an issue',
      'Update issue status',
      'Add comment',
      'Search issues',
    ],
    logo: 'jira',
  },
  {
    toolkitSlug: 'asana',
    toolkitName: 'Asana',
    keywords: [
      'asana',
      'asana task',
      'asana project',
      'project task',
      'task management',
    ],
    description: 'Manage Asana tasks and projects',
    actions: [
      'Create a task',
      'Update task status',
      'List tasks',
      'Assign task',
    ],
    logo: 'asana',
  },
  {
    toolkitSlug: 'trello',
    toolkitName: 'Trello',
    keywords: [
      'trello',
      'trello card',
      'trello board',
      'kanban',
      'trello list',
    ],
    description: 'Manage Trello boards and cards',
    actions: [
      'Create a card',
      'Move card to list',
      'Add comment to card',
      'List cards',
    ],
    logo: 'trello',
  },
  {
    toolkitSlug: 'google_drive',
    toolkitName: 'Google Drive',
    keywords: [
      'google drive',
      'drive',
      'gdrive',
      'google doc',
      'google sheet',
      'google slide',
      'shared file',
    ],
    description: 'Access and manage Google Drive files',
    actions: [
      'Search files',
      'Get file content',
      'Create a document',
      'Share a file',
    ],
    logo: 'google-drive',
  },
  {
    toolkitSlug: 'microsoft_teams',
    toolkitName: 'Microsoft Teams',
    keywords: [
      'teams',
      'microsoft teams',
      'ms teams',
      'teams channel',
      'teams chat',
    ],
    description: 'Send messages and manage Microsoft Teams',
    actions: [
      'Send a message',
      'List channels',
      'Get team info',
      'Reply to thread',
    ],
    logo: 'microsoft-teams',
  },
  {
    toolkitSlug: 'outlook',
    toolkitName: 'Outlook',
    keywords: [
      'outlook',
      'outlook email',
      'outlook calendar',
      'microsoft mail',
      'exchange',
    ],
    description: 'Send emails and manage Outlook calendar',
    actions: [
      'Send an email',
      'Create calendar event',
      'List emails',
      'Reply to email',
    ],
    logo: 'outlook',
  },
  {
    toolkitSlug: 'discord',
    toolkitName: 'Discord',
    keywords: [
      'discord',
      'discord server',
      'discord channel',
      'discord message',
    ],
    description: 'Send messages and manage Discord servers',
    actions: [
      'Send a message',
      'List channels',
      'Get server info',
      'Manage roles',
    ],
    logo: 'discord',
  },
];

/**
 * Get all unique keywords across all toolkits.
 */
export function getAllKeywords(): string[] {
  const keywordSet = new Set<string>();
  for (const mapping of TOOLKIT_KEYWORD_MAPPINGS) {
    for (const keyword of mapping.keywords) {
      keywordSet.add(keyword.toLowerCase());
    }
  }
  return Array.from(keywordSet);
}

/**
 * Get a toolkit mapping by slug.
 */
export function getToolkitMapping(
  toolkitSlug: string,
): ToolkitKeywordMapping | undefined {
  return TOOLKIT_KEYWORD_MAPPINGS.find((m) => m.toolkitSlug === toolkitSlug);
}

/**
 * Find toolkit(s) that match a given keyword.
 * Returns all toolkits that contain the keyword.
 */
export function findToolkitsByKeyword(keyword: string): ToolkitKeywordMapping[] {
  const normalizedKeyword = keyword.toLowerCase().trim();

  return TOOLKIT_KEYWORD_MAPPINGS.filter((mapping) =>
    mapping.keywords.some((k) => k.toLowerCase() === normalizedKeyword),
  );
}

/**
 * Find toolkit(s) that contain any keyword from a message.
 * Returns toolkits sorted by number of keyword matches (most matches first).
 */
export function findToolkitByKeyword(message: string): ToolkitKeywordMapping | null {
  const normalizedMessage = message.toLowerCase();

  // Count matches for each toolkit
  const matchCounts: Array<{ mapping: ToolkitKeywordMapping; count: number; matchedKeywords: string[] }> = [];

  for (const mapping of TOOLKIT_KEYWORD_MAPPINGS) {
    const matchedKeywords: string[] = [];

    for (const keyword of mapping.keywords) {
      if (normalizedMessage.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    if (matchedKeywords.length > 0) {
      matchCounts.push({
        mapping,
        count: matchedKeywords.length,
        matchedKeywords,
      });
    }
  }

  // Sort by match count (descending), then by order in array (priority)
  matchCounts.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    // Same count - prefer earlier (higher priority) toolkits
    return (
      TOOLKIT_KEYWORD_MAPPINGS.indexOf(a.mapping) -
      TOOLKIT_KEYWORD_MAPPINGS.indexOf(b.mapping)
    );
  });

  return matchCounts.length > 0 ? matchCounts[0].mapping : null;
}

/**
 * Find all toolkits that match keywords in a message.
 * Returns all matches with their matched keywords.
 */
export function findAllToolkitsByKeywords(message: string): Array<{
  mapping: ToolkitKeywordMapping;
  matchedKeywords: string[];
}> {
  const normalizedMessage = message.toLowerCase();
  const results: Array<{
    mapping: ToolkitKeywordMapping;
    matchedKeywords: string[];
  }> = [];

  for (const mapping of TOOLKIT_KEYWORD_MAPPINGS) {
    const matchedKeywords: string[] = [];

    for (const keyword of mapping.keywords) {
      if (normalizedMessage.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
      }
    }

    if (matchedKeywords.length > 0) {
      results.push({ mapping, matchedKeywords });
    }
  }

  return results;
}