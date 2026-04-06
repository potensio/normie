/**
 * Skill Prompt Builder
 *
 * Formats skills for injection into the system prompt.
 * Uses Pi's XML format for consistency with Agent Skills standard.
 */

import type { SkillForPrompt } from './skill-service.js';

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format skills for injection into system prompt.
 *
 * Output format matches Pi SDK's formatSkillsForPrompt():
 * <available_skills>
 *   <skill>
 *     <name>...</name>
 *     <description>...</description>
 *     <location>...</location>
 *   </skill>
 * </available_skills>
 */
export function buildSkillsPrompt(skills: SkillForPrompt[]): string {
  if (skills.length === 0) {
    return '';
  }

  const lines = [
    '',
    'The following skills provide specialized instructions for specific tasks.',
    'Use the read tool to load a skill\'s file when the task matches its description.',
    'When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.',
    '',
    '<available_skills>',
  ];

  for (const skill of skills) {
    lines.push('  <skill>');
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push('  </skill>');
  }

  lines.push('</available_skills>');

  return lines.join('\n');
}