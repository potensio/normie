-- Migration: Add workspace_skills and workspace_skill_files tables

-- Create workspace_skills table
CREATE TABLE IF NOT EXISTS workspace_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_workspace_skill_name UNIQUE (workspace_id, name)
);

-- Create index on workspace_id
CREATE INDEX IF NOT EXISTS idx_workspace_skills_workspace ON workspace_skills(workspace_id);

-- Create workspace_skill_files table
CREATE TABLE IF NOT EXISTS workspace_skill_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES workspace_skills(id) ON DELETE CASCADE,
  relative_path VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_skill_file_path UNIQUE (skill_id, relative_path)
);

-- Create index on skill_id
CREATE INDEX IF NOT EXISTS idx_workspace_skill_files_skill ON workspace_skill_files(skill_id);