/**
 * Skills API Routes
 *
 * Endpoints for managing workspace-scoped skills.
 */

import { Router, type Request, Response, NextFunction } from 'express';
import { getDb } from '../db/index.js';
import { SkillService } from '../services/skill-service.js';
import { loadWorkspace, requireWorkspaceAccess } from '../middleware/resource-access.js';

// Create router
export const skillsRouter = Router();

// ============================================================================
// POST /api/workspaces/:workspaceId/skills - Upload a new skill
// ============================================================================
skillsRouter.post(
  '/workspaces/:workspaceId/skills',
  loadWorkspace,
  requireWorkspaceAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const db = getDb();
      const skillService = new SkillService(db);

      // Parse request body
      const { files } = req.body;

      if (!files || !Array.isArray(files)) {
        res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'files array is required',
          },
        });
        return;
      }

      // Validate files
      const validation = await skillService.validate(workspaceId, files);

      if (!validation.valid) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Skill validation failed',
            details: validation.errors,
          },
        });
        return;
      }

      // Extract frontmatter from SKILL.md
      const skillMd = files.find(f => f.path === 'SKILL.md');
      const frontmatter = parseFrontmatterFromContent(skillMd.content);

      // Check for duplicate name
      const existingName = await skillService.nameExists(workspaceId, frontmatter.name);
      if (existingName) {
        res.status(409).json({
          error: {
            code: 'SKILL_NAME_EXISTS',
            message: `Skill named "${frontmatter.name}" already exists in this workspace`,
          },
        });
        return;
      }

      // Create skill
      const result = await skillService.create({
        workspaceId,
        name: frontmatter.name,
        description: frontmatter.description,
        files,
      });

      res.status(201).json({
        skill: result.skill,
        files: result.files,
      });
    } catch (error) {
      console.error('[Skills API] Error creating skill:', error);
      next(error);
    }
  }
);

// ============================================================================
// GET /api/workspaces/:workspaceId/skills - List all skills
// ============================================================================
skillsRouter.get(
  '/workspaces/:workspaceId/skills',
  loadWorkspace,
  requireWorkspaceAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.params.workspaceId as string;
      const db = getDb();
      const skillService = new SkillService(db);

      const skills = await skillService.list(workspaceId);

      res.json({ skills });
    } catch (error) {
      console.error('[Skills API] Error listing skills:', error);
      next(error);
    }
  }
);

// ============================================================================
// GET /api/workspaces/:workspaceId/skills/:skillId - Get a single skill
// ============================================================================
skillsRouter.get(
  '/workspaces/:workspaceId/skills/:skillId',
  loadWorkspace,
  requireWorkspaceAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const skillId = req.params.skillId as string;
      const db = getDb();
      const skillService = new SkillService(db);

      const result = await skillService.get(skillId);

      if (!result) {
        res.status(404).json({
          error: {
            code: 'SKILL_NOT_FOUND',
            message: 'Skill not found',
          },
        });
        return;
      }

      res.json({
        skill: result.skill,
        files: result.files,
      });
    } catch (error) {
      console.error('[Skills API] Error getting skill:', error);
      next(error);
    }
  }
);

// ============================================================================
// DELETE /api/workspaces/:workspaceId/skills/:skillId - Delete a skill
// ============================================================================
skillsRouter.delete(
  '/workspaces/:workspaceId/skills/:skillId',
  loadWorkspace,
  requireWorkspaceAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const skillId = req.params.skillId as string;
      const db = getDb();
      const skillService = new SkillService(db);

      // Check if skill exists
      const existing = await skillService.get(skillId);

      if (!existing) {
        res.status(404).json({
          error: {
            code: 'SKILL_NOT_FOUND',
            message: 'Skill not found',
          },
        });
        return;
      }

      // Delete skill
      await skillService.delete(skillId);

      res.status(204).send();
    } catch (error) {
      console.error('[Skills API] Error deleting skill:', error);
      next(error);
    }
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse frontmatter from SKILL.md content
 */
function parseFrontmatterFromContent(content: string): { name: string; description: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    return { name: '', description: '' };
  }

  const yamlContent = frontmatterMatch[1];
  const result: { name: string; description: string } = { name: '', description: '' };

  const lines = yamlContent.split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') || value.startsWith("'")) && value.endsWith(value[0])) {
      value = value.slice(1, -1);
    }

    if (key === 'name') result.name = value;
    if (key === 'description') result.description = value;
  }

  return result;
}