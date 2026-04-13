/**
 * Skill Service
 *
 * Handles CRUD operations for workspace-scoped skills,
 * including file storage and validation.
 */

import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as schema from "../db/schema.js";
import type { DbClient } from "../db/index.js";
import type { SkillFrontmatter, ParsedSkillFile } from "../types/skill.js";

// ============================================================================
// Types
// ============================================================================

export interface CreateSkillInput {
  workspaceId: string;
  name: string;
  description: string;
  files: Array<{
    path: string; // Relative path (e.g., "SKILL.md", "scripts/run.sh")
    content: string; // File content
  }>;
}

export interface SkillWithFiles {
  skill: typeof schema.workspaceSkills.$inferSelect;
  files: (typeof schema.workspaceSkillFiles.$inferSelect)[];
}

export interface SkillValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

export interface SkillForPrompt {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const SKILL_MD_FILE = "SKILL.md";

// ============================================================================
// SkillService Class
// ============================================================================

export class SkillService {
  private db: DbClient;
  private dataDir: string;

  constructor(db: DbClient, dataDir?: string) {
    this.db = db;
    this.dataDir = dataDir || process.env.DATA_DIR || "./data";
  }

  /**
   * Validate skill files before creation.
   * Checks for SKILL.md, valid frontmatter, name format.
   */
  async validate(
    workspaceId: string,
    files: Array<{ path: string; content: string }>,
  ): Promise<SkillValidationResult> {
    const errors: Array<{ field: string; message: string }> = [];

    // Check for SKILL.md
    const skillMd = files.find((f) => f.path === SKILL_MD_FILE);
    if (!skillMd) {
      errors.push({
        field: "files",
        message: "SKILL.md is required",
      });
      return { valid: false, errors };
    }

    // Parse frontmatter
    const parsed = this.parseSkillFile(skillMd.content);

    // Validate frontmatter fields
    if (!parsed.frontmatter.name) {
      errors.push({
        field: "name",
        message: "name is required in SKILL.md frontmatter",
      });
    } else {
      // Validate name format
      const nameErrors = this.validateSkillName(parsed.frontmatter.name);
      errors.push(...nameErrors);
    }

    if (!parsed.frontmatter.description) {
      errors.push({
        field: "description",
        message: "description is required in SKILL.md frontmatter",
      });
    } else if (parsed.frontmatter.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push({
        field: "description",
        message: `description exceeds ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Create a new skill with files.
   */
  async create(input: CreateSkillInput): Promise<SkillWithFiles> {
    const { workspaceId, name, description, files } = input;

    // Build skill directory path
    const skillDir = path.join(this.dataDir, "skills", workspaceId, name);
    const skillMdPath = path.join(skillDir, SKILL_MD_FILE);

    // Create directory
    await fs.mkdir(skillDir, { recursive: true });

    // Write all files
    const fileRecords: Array<{ relativePath: string; filePath: string }> = [];

    for (const file of files) {
      const filePath = path.join(skillDir, file.path);
      const dir = path.dirname(filePath);

      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, file.content, "utf-8");

      // Track for database (skip SKILL.md as it's stored in skill.filePath)
      if (file.path !== SKILL_MD_FILE) {
        fileRecords.push({
          relativePath: file.path,
          filePath,
        });
      }
    }

    // Insert skill into database
    const [skill] = await this.db
      .insert(schema.workspaceSkills)
      .values({
        workspaceId,
        name,
        description,
        filePath: skillMdPath,
      })
      .returning();

    // Insert file records
    const skillFiles: (typeof schema.workspaceSkillFiles.$inferSelect)[] = [];

    if (fileRecords.length > 0) {
      const insertedFiles = await this.db
        .insert(schema.workspaceSkillFiles)
        .values(
          fileRecords.map((f) => ({
            skillId: skill.id,
            relativePath: f.relativePath,
            filePath: f.filePath,
          })),
        )
        .returning();

      skillFiles.push(...insertedFiles);
    }

    return { skill, files: skillFiles };
  }

  /**
   * List all skills for a workspace.
   */
  async list(
    workspaceId: string,
  ): Promise<(typeof schema.workspaceSkills.$inferSelect)[]> {
    return this.db
      .select()
      .from(schema.workspaceSkills)
      .where(eq(schema.workspaceSkills.workspaceId, workspaceId))
      .orderBy(schema.workspaceSkills.createdAt);
  }

  /**
   * Get a single skill with its files.
   */
  async get(skillId: string): Promise<SkillWithFiles | null> {
    const [skill] = await this.db
      .select()
      .from(schema.workspaceSkills)
      .where(eq(schema.workspaceSkills.id, skillId))
      .limit(1);

    if (!skill) {
      return null;
    }

    const files = await this.db
      .select()
      .from(schema.workspaceSkillFiles)
      .where(eq(schema.workspaceSkillFiles.skillId, skillId));

    return { skill, files };
  }

  /**
   * Delete a skill and its files from disk and database.
   */
  async delete(skillId: string): Promise<void> {
    // Get skill to find file path
    const skillWithFiles = await this.get(skillId);

    if (!skillWithFiles) {
      return;
    }

    // Delete skill directory from disk
    const skillDir = path.dirname(skillWithFiles.skill.filePath);
    try {
      await fs.rm(skillDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`[SkillService] Error deleting skill directory: ${error}`);
      // Continue with DB deletion even if file deletion fails
    }

    // Delete from database (cascade will remove skill_files)
    await this.db
      .delete(schema.workspaceSkills)
      .where(eq(schema.workspaceSkills.id, skillId));
  }

  /**
   * Load skills for prompt injection.
   */
  async loadForPrompt(workspaceId: string): Promise<SkillForPrompt[]> {
    const skills = await this.list(workspaceId);

    return skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      filePath: skill.filePath,
      baseDir: path.dirname(skill.filePath),
    }));
  }

  /**
   * Check if a skill name already exists in a workspace.
   */
  async nameExists(workspaceId: string, name: string): Promise<boolean> {
    const existing = await this.db
      .select()
      .from(schema.workspaceSkills)
      .where(eq(schema.workspaceSkills.workspaceId, workspaceId))
      .limit(1);

    return existing.some((s) => s.name === name);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private parseSkillFile(content: string): ParsedSkillFile {
    const errors: string[] = [];
    let frontmatter: SkillFrontmatter = {
      name: "",
      description: "",
    };

    // Parse YAML frontmatter (between --- markers)
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (frontmatterMatch) {
      const yamlContent = frontmatterMatch[1];

      // Simple YAML parsing for flat key-value pairs
      const lines = yamlContent.split("\n");
      for (const line of lines) {
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;

        const key = line.slice(0, colonIndex).trim();
        let value: string | boolean = line.slice(colonIndex + 1).trim();

        // Handle boolean values
        if (value === "true") value = true as unknown as string;
        if (value === "false") value = false as unknown as string;

        // Remove quotes from string values
        if (
          typeof value === "string" &&
          (value.startsWith('"') || value.startsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        if (
          key === "name" ||
          key === "description" ||
          key === "disable-model-invocation"
        ) {
          (frontmatter as unknown as Record<string, unknown>)[key] = value;
        }
      }
    } else {
      errors.push("No YAML frontmatter found");
    }

    return {
      frontmatter,
      content,
      isValid:
        errors.length === 0 && !!frontmatter.name && !!frontmatter.description,
      errors,
    };
  }

  private validateSkillName(
    name: string,
  ): Array<{ field: string; message: string }> {
    const errors: Array<{ field: string; message: string }> = [];

    if (name.length > MAX_NAME_LENGTH) {
      errors.push({
        field: "name",
        message: `name exceeds ${MAX_NAME_LENGTH} characters`,
      });
    }

    if (!/^[a-z0-9-]+$/.test(name)) {
      errors.push({
        field: "name",
        message: "name must be lowercase a-z, 0-9, hyphens only",
      });
    }

    if (name.startsWith("-") || name.endsWith("-")) {
      errors.push({
        field: "name",
        message: "name must not start or end with a hyphen",
      });
    }

    if (name.includes("--")) {
      errors.push({
        field: "name",
        message: "name must not contain consecutive hyphens",
      });
    }

    return errors;
  }
}
