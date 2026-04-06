# Skills System Design Document

## Overview

This document outlines the architecture for implementing workspace-scoped skills in Normie. Skills are self-contained capability packages that extend the AI's abilities with specialized workflows (e.g., web search, document processing, custom scripts). Users can upload skills per-workspace, and the system automatically injects skill descriptions into the system prompt so the LLM can discover and use them.

The architecture follows a layered approach:
- **Storage Layer**: PostgreSQL for metadata, filesystem for skill files
- **Service Layer**: Skill management (CRUD) and prompt formatting
- **Integration Layer**: Injection into Pi Agent SDK and Bedrock Mantle paths

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Electron)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ SkillUpload  │  │ SkillList    │  │ SkillDetail          │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼──────────────┘
          │                 │                     │
          ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  POST   /api/workspaces/:id/skills          (upload)     │  │
│  │  GET    /api/workspaces/:id/skills          (list)       │  │
│  │  GET    /api/workspaces/:id/skills/:skillId (get)        │  │
│  │  DELETE /api/workspaces/:id/skills/:skillId (delete)     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Service Layer                              │
│  ┌─────────────────┐  ┌──────────────────────────────────────┐ │
│  │ SkillService    │  │ ContextBuilder (existing, modified)  │ │
│  │ - create()      │  │ - buildSystemContext() + skills      │ │
│  │ - list()        │  └──────────────────────────────────────┘ │
│  │ - get()         │                                           │
│  │ - delete()      │  ┌──────────────────────────────────────┐ │
│  │ - validate()    │  │ SkillPromptBuilder                    │ │
│  └─────────────────┘  │ - buildSkillsPrompt()                │ │
│                       │ - formatForPrompt()                   │ │
│                       └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│    Database     │  │   Filesystem    │  │    Pi Integration    │
│  (PostgreSQL)   │  │   (DATA_DIR)    │  │                     │
│ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────────┐ │
│ │workspace_   │ │  │ │skills/      │ │  │ │ Pi Agent SDK    │ │
│ │  skills     │ │  │ │ {ws}/       │ │  │ │ (native skills) │ │
│ ├─────────────┤ │  │ │  {skill}/   │ │  │ ├─────────────────┤ │
│ │workspace_   │ │  │ │  SKILL.md   │ │  │ │ Bedrock Mantle  │ │
│ │  skill_files│ │  │ │  *.sh       │ │  │ │ (manual inject) │ │
│ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────────┘ │
└─────────────────┘  └─────────────────┘  └─────────────────────┘
```

### Layer Responsibilities

| Layer | Owns | Does Not Own |
|-------|------|--------------|
| API | HTTP routing, validation, auth | Business logic, storage |
| Service | Skill CRUD, validation, prompt formatting | HTTP, direct DB access |
| Storage | Persistence, file I/O | Business rules |

---

## Components and Interfaces

### SkillService

```typescript
// apps/server/src/services/skill-service.ts

import type { Skill, SkillFile } from '../db/schema.js';

export interface CreateSkillInput {
  workspaceId: string;
  name: string;
  description: string;
  files: Array<{
    path: string;      // Relative path (e.g., "SKILL.md", "scripts/run.sh")
    content: string;   // File content
  }>;
}

export interface SkillWithFiles {
  skill: Skill;
  files: SkillFile[];
}

export interface SkillValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

export class SkillService {
  /**
   * Create a new skill with files.
   * Validates SKILL.md frontmatter, saves files to disk, stores metadata.
   */
  async create(input: CreateSkillInput): Promise<SkillWithFiles>;

  /**
   * List all skills for a workspace.
   */
  async list(workspaceId: string): Promise<Skill[]>;

  /**
   * Get a single skill with its files.
   */
  async get(skillId: string): Promise<SkillWithFiles | null>;

  /**
   * Delete a skill and its files from disk and database.
   */
  async delete(skillId: string): Promise<void>;

  /**
   * Validate skill files before creation.
   * Checks for SKILL.md, valid frontmatter, name uniqueness.
   */
  async validate(workspaceId: string, files: Array<{ path: string; content: string }>): Promise<SkillValidationResult>;

  /**
   * Load skills for prompt injection (Bedrock Mantle path).
   * Returns skills formatted for Pi's formatSkillsForPrompt().
   */
  async loadForPrompt(workspaceId: string): Promise<Array<{
    name: string;
    description: string;
    filePath: string;
    baseDir: string;
  }>>;
}
```

### SkillPromptBuilder

```typescript
// apps/server/src/services/skill-prompt-builder.ts

/**
 * Format skills for injection into system prompt.
 * Uses Pi's XML format for consistency.
 */
export function buildSkillsPrompt(
  skills: Array<{
    name: string;
    description: string;
    filePath: string;
  }>
): string;
```

### Modified ContextBuilder

```typescript
// apps/server/src/services/context-builder.ts (Modified)

// Add skill loading to buildSystemContext()
export async function buildSystemContext(
  workspaceId: string,
  db: DbType
): Promise<string> {
  const parts: string[] = [];

  // ... existing code for APPLICATION_PROMPT, SOUL.md, etc.

  // NEW: Load and append skills
  const skillService = new SkillService(db);
  const skills = await skillService.loadForPrompt(workspaceId);
  if (skills.length > 0) {
    parts.push(buildSkillsPrompt(skills));
  }

  return parts.join('\n\n---\n\n');
}
```

---

## Data Models

### Database Schema

```typescript
// apps/server/src/db/schema.ts

// Workspace Skills
export const workspaceSkills = pgTable('workspace_skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 64 }).notNull(),
  description: text('description').notNull(),
  filePath: text('file_path').notNull(),  // Path to SKILL.md on disk
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_workspace_skills_workspace').on(table.workspaceId),
  unique('unique_workspace_skill_name').on(table.workspaceId, table.name)
]);

// Skill Files (supporting files like scripts)
export const workspaceSkillFiles = pgTable('workspace_skill_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  skillId: uuid('skill_id').notNull().references(() => workspaceSkills.id, { onDelete: 'cascade' }),
  relativePath: varchar('relative_path', { length: 255 }).notNull(),
  filePath: text('file_path').notNull(),  // Absolute path on disk
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_workspace_skill_files_skill').on(table.skillId),
  unique('unique_skill_file_path').on(table.skillId, table.relativePath)
]);

// Relations
export const workspaceSkillsRelations = relations(workspaceSkills, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [workspaceSkills.workspaceId],
    references: [workspaces.id]
  }),
  files: many(workspaceSkillFiles)
}));

export const workspaceSkillFilesRelations = relations(workspaceSkillFiles, ({ one }) => ({
  skill: one(workspaceSkills, {
    fields: [workspaceSkillFiles.skillId],
    references: [workspaceSkills.id]
  })
}));
```

### Domain Types

```typescript
// apps/server/src/types/skill.ts

export interface SkillFrontmatter {
  name: string;
  description: string;
  'disable-model-invocation'?: boolean;
}

export interface ParsedSkillFile {
  frontmatter: SkillFrontmatter;
  content: string;
  isValid: boolean;
  errors: string[];
}
```

---

## Correctness Properties

### Property 1: Skill Uniqueness

_For any_ workspace, there SHALL be at most one skill with a given name.

**Validates: Requirement 3.4**

### Property 2: Skill File Location Consistency

_For any_ skill stored in the database, the `filePath` in `workspace_skills` SHALL point to an existing `SKILL.md` file on disk within `{DATA_DIR}/skills/{workspaceId}/{skillName}/`.

**Validates: Requirement 2.1, 2.2**

### Property 3: Prompt Injection Completeness

_For any_ chat request with workspace `W` containing `N` skills, the system prompt SHALL include exactly `N` skill entries in the `<available_skills>` XML block.

**Validates: Requirement 4.1, 4.2**

### Property 4: Cascade Delete Completeness

_For any_ skill deletion, the system SHALL remove: (1) the skill row from `workspace_skills`, (2) all associated rows from `workspace_skill_files`, (3) the skill directory from disk.

**Validates: Requirement 2.4, 6.3**

| Property | Requirement(s) | Test Type |
|----------|----------------|-----------|
| Property 1: Skill Uniqueness | Req 3.4 | Unit |
| Property 2: File Location Consistency | Req 2.1, 2.2 | Integration |
| Property 3: Prompt Injection Completeness | Req 4.1, 4.2 | Integration |
| Property 4: Cascade Delete Completeness | Req 2.4, 6.3 | Integration |

---

## Error Handling

### Error Type Catalog

| Name | When | Detection | Handling |
|------|------|-----------|----------|
| `SKILL_MD_MISSING` | Upload has no SKILL.md | Check files array for "SKILL.md" path | Return 400 with message |
| `INVALID_FRONTMATTER` | SKILL.md missing name or description | Parse YAML frontmatter, check required fields | Return 400 with field details |
| `SKILL_NAME_EXISTS` | Skill name already in workspace | DB unique constraint or pre-check | Return 409 with existing skill ID |
| `FILE_WRITE_ERROR` | Cannot write to DATA_DIR | Catch fs.writeFile errors | Return 500, log error |
| `SKILL_NOT_FOUND` | Get/Delete non-existent skill | DB query returns null | Return 404 |
| `UNAUTHORIZED_ACCESS` | User not member of workspace | Check workspace membership | Return 403 |

### Error Response Format

```typescript
interface SkillErrorResponse {
  error: {
    code: string;        // e.g., "SKILL_MD_MISSING"
    message: string;     // Human-readable message
    details?: unknown;   // Additional context (validation errors, etc.)
  }
}
```

---

## Data Flow

### Skill Upload Flow

```
1. Client uploads files as multipart/form-data to POST /api/workspaces/:id/skills
2. Route handler authenticates user, checks workspace membership
3. SkillService.validate() checks:
   - SKILL.md exists in files
   - SKILL.md has valid frontmatter (name, description)
   - Skill name is unique in workspace
4. SkillService.create():
   a. Creates skill directory: {DATA_DIR}/skills/{workspaceId}/{skillName}/
   b. Writes all files to directory
   c. Inserts skill row in workspace_skills
   d. Inserts file rows in workspace_skill_files
5. Returns 201 with created skill metadata
```

### Skill Discovery Flow (Bedrock Mantle Path)

```
1. Chat request arrives with workspaceId
2. ContextBuilder.buildSystemContext() called
3. SkillService.loadForPrompt(workspaceId):
   a. Queries workspace_skills for workspace
   b. Maps to format expected by formatSkillsForPrompt()
4. buildSkillsPrompt() formats skills as XML
5. XML appended to system prompt
6. System prompt sent to Bedrock Mantle API
```

### Skill Discovery Flow (Pi Agent SDK Path)

```
1. Chat request arrives with workspaceId
2. createAgentSession() called with:
   - agentDir: ~/.pi/agent
   - cwd: workspace directory (or temp dir)
   - settingsManager: configured with workspace
3. Pi SDK's internal loadSkills() scans:
   - ~/.pi/agent/skills/ (global)
   - .pi/skills/ (project-local)
4. Skills formatted by SDK and included in prompt
```

---

## Testing Strategy

### Unit Tests

- `SkillService.validate()` - frontmatter parsing, error cases
- `buildSkillsPrompt()` - XML formatting
- Name validation (length, characters, uniqueness)

### Property-Based Tests

**Property 1:** For any list of skills, `buildSkillsPrompt()` produces valid XML with one `<skill>` element per input skill.

**Property 2:** For any valid frontmatter, parsing and re-formatting produces equivalent name/description.

### Integration Tests

- Upload skill with SKILL.md + supporting files → all files exist on disk
- Delete skill → directory removed, DB rows deleted
- Chat with skills in workspace → skills appear in system prompt
- Duplicate skill name → 409 error
- Upload without SKILL.md → 400 error

---

## File Structure

```
apps/server/src/
├── db/
│   └── schema.ts              # [Modify] Add workspaceSkills, workspaceSkillFiles
├── routes/
│   └── skills.ts              # [Create] API routes for skill CRUD
├── services/
│   ├── skill-service.ts       # [Create] Skill CRUD operations
│   ├── skill-prompt-builder.ts # [Create] Format skills for prompt
│   └── context-builder.ts     # [Modify] Add skill loading
└── types/
    └── skill.ts               # [Create] Skill-related types

DATA_DIR/skills/
└── {workspaceId}/             # [Create on demand]
    └── {skillName}/
        ├── SKILL.md
        └── *.sh (supporting files)
```

| File | Action | Description |
|------|--------|-------------|
| `apps/server/src/db/schema.ts` | Modify | Add workspaceSkills, workspaceSkillFiles tables |
| `apps/server/src/routes/skills.ts` | Create | API routes: POST, GET, DELETE |
| `apps/server/src/services/skill-service.ts` | Create | Skill CRUD, validation, file operations |
| `apps/server/src/services/skill-prompt-builder.ts` | Create | Format skills as XML for prompt |
| `apps/server/src/services/context-builder.ts` | Modify | Add skill loading and injection |
| `apps/server/src/types/skill.ts` | Create | Domain types for skills |
| `apps/server/src/index.ts` | Modify | Register skill routes |

---

## Dependencies

No new dependencies required. All functionality uses:
- Existing `drizzle-orm` for database
- Node.js `fs` for file operations
- Pi SDK's `formatSkillsForPrompt` for XML formatting (already installed)