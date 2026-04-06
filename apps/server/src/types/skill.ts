/**
 * Skill domain types for the Skills System
 */

/**
 * Frontmatter parsed from SKILL.md YAML header
 */
export interface SkillFrontmatter {
  name: string;
  description: string;
  'disable-model-invocation'?: boolean;
}

/**
 * Result of parsing a SKILL.md file
 */
export interface ParsedSkillFile {
  frontmatter: SkillFrontmatter;
  content: string;
  isValid: boolean;
  errors: string[];
}