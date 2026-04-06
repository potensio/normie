# Skills System Requirements

## Introduction

This document specifies the requirements for implementing workspace-scoped skills in Normie. Skills are self-contained capability packages consisting of a `SKILL.md` file with YAML frontmatter and optional supporting files (scripts, templates, etc.). The system must allow users to upload and manage skills per workspace, and automatically inject skill descriptions into the system prompt so the LLM can discover and use them.

## Glossary

| Term | Definition |
|------|------------|
| **Skill** | A self-contained capability package with a `SKILL.md` file (YAML frontmatter + Markdown content) and optional supporting files |
| **SKILL.md** | Required skill definition file with frontmatter (`name`, `description`) and content (instructions for the LLM) |
| **Skill Files** | Additional files in a skill directory (scripts, templates, etc.) that the skill content references |
| **Workspace-scoped** | Resources that belong to a specific workspace and are only available within that workspace context |

## Requirements

### Requirement 1: Skill Storage in Database

**User Story:** As a user, I want my uploaded skills to be stored per-workspace, so that different workspaces can have different skills.

#### Acceptance Criteria

1. WHEN a skill is uploaded THEN the System SHALL store it in a `workspace_skills` table with workspace association
2. WHEN a skill is stored THEN the System SHALL store the skill name, description, and file path reference
3. WHEN a skill has multiple files THEN the System SHALL store each file in `workspace_skill_files` table
4. WHEN a skill is stored THEN the System SHALL preserve the directory structure (skill name = folder name)

### Requirement 2: Skill File Storage

**User Story:** As a system, I need to store skill files on disk so that the LLM can read them when needed.

#### Acceptance Criteria

1. WHEN a skill is uploaded THEN the System SHALL save files to `{DATA_DIR}/skills/{workspaceId}/{skillName}/`
2. WHEN files are saved THEN `SKILL.md` SHALL be saved at the root of the skill directory
3. WHEN supporting files are uploaded THEN they SHALL preserve their relative paths within the skill directory
4. WHEN a skill is deleted THEN the System SHALL remove the entire skill directory

### Requirement 3: Skill Upload API

**User Story:** As a frontend, I want an API endpoint to upload skills, so that users can add new capabilities.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/workspaces/{workspaceId}/skills` with a skill folder THEN the System SHALL validate the uploaded files
2. WHEN the uploaded files do not contain `SKILL.md` THEN the System SHALL return a 400 error with message "SKILL.md is required"
3. WHEN `SKILL.md` has invalid frontmatter (missing name or description) THEN the System SHALL return a 400 error with validation details
4. WHEN a skill with the same name already exists in the workspace THEN the System SHALL return a 409 conflict error
5. WHEN upload is successful THEN the System SHALL return the created skill metadata with 201 status

### Requirement 4: Skill Discovery for LLM

**User Story:** As an LLM, I want to know what skills are available in the current workspace, so that I can decide when to use them.

#### Acceptance Criteria

1. WHEN a chat request is processed THEN the System SHALL load all skills for the workspace from database
2. WHEN skills are loaded THEN the System SHALL format them using Pi's `formatSkillsForPrompt()` XML format
3. WHEN the system prompt is built THEN the System SHALL append the formatted skills XML to the system prompt
4. WHEN the `location` field is set for each skill THEN it SHALL point to the on-disk path of `SKILL.md`

### Requirement 5: Skill Content Access

**User Story:** As an LLM, I want to read the full content of a skill file, so that I can follow the skill's instructions.

#### Acceptance Criteria

1. WHEN the LLM uses the read tool on a skill file path THEN the System SHALL return the file content
2. WHEN a skill references supporting files (scripts, etc.) THEN the LLM SHALL be able to read them from the skill directory
3. WHEN the LLM needs to execute a skill script THEN the bash tool SHALL work with paths inside the skill directory

### Requirement 6: Skill Management APIs

**User Story:** As a frontend, I want APIs to list, get, and delete skills, so that users can manage their skills.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/workspaces/{workspaceId}/skills` THEN the System SHALL return all skills for the workspace
2. WHEN a GET request is made to `/api/workspaces/{workspaceId}/skills/{skillId}` THEN the System SHALL return the skill details including file list
3. WHEN a DELETE request is made to `/api/workspaces/{workspaceId}/skills/{skillId}` THEN the System SHALL remove the skill from database and delete files from disk

### Requirement 7: Skill Injection in Both Provider Paths

**User Story:** As a developer, I want skills to work in both Pi Agent SDK and Bedrock Mantle paths, so that users have consistent behavior regardless of provider.

#### Acceptance Criteria

1. WHEN using Pi Agent SDK path THEN the System SHALL rely on SDK's native skill loading (via `createAgentSession`)
2. WHEN using Bedrock Mantle path THEN the System SHALL manually load skills from database and inject to system prompt
3. WHEN skills are injected in either path THEN the resulting prompt sent to the LLM SHALL have equivalent skill information

---

## Database Schema

```sql
-- Workspace Skills
CREATE TABLE workspace_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  file_path TEXT NOT NULL,  -- Path to SKILL.md on disk
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);

CREATE INDEX idx_workspace_skills_workspace ON workspace_skills(workspace_id);

-- Skill Files (for supporting files like scripts)
CREATE TABLE workspace_skill_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES workspace_skills(id) ON DELETE CASCADE,
  relative_path VARCHAR(255) NOT NULL,  -- Path relative to skill directory
  file_path TEXT NOT NULL,  -- Absolute path on disk
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(skill_id, relative_path)
);
```

## File Structure

```
{DATA_DIR}/
└── skills/
    └── {workspaceId}/
        └── {skillName}/
            ├── SKILL.md
            ├── script.sh
            └── templates/
                └── example.md
```