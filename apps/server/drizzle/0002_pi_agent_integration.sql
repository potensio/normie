-- Pi Agent Integration Migration
-- Remove legacy session columns, add JSONL session tracking and branching support

-- Step 1: Remove old session columns
ALTER TABLE chats DROP COLUMN IF EXISTS session_id;
ALTER TABLE chats DROP COLUMN IF EXISTS session_provider;

-- Step 2: Add new session file path column
ALTER TABLE chats ADD COLUMN IF NOT EXISTS session_file_path TEXT;

-- Step 3: Add branch tracking columns
ALTER TABLE chats ADD COLUMN IF NOT EXISTS parent_chat_id UUID;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS branch_point_message_id TEXT;

-- Step 4: Add foreign key constraint for parent_chat_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chats_parent_chat_id_fkey' 
        AND table_name = 'chats'
    ) THEN
        ALTER TABLE chats
          ADD CONSTRAINT chats_parent_chat_id_fkey
          FOREIGN KEY (parent_chat_id)
          REFERENCES chats(id)
          ON DELETE SET NULL;
    END IF;
END $$;

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chats_parent_chat_id ON chats(parent_chat_id);
CREATE INDEX IF NOT EXISTS idx_chats_session_file_path ON chats(session_file_path) WHERE session_file_path IS NOT NULL;

-- Step 6: Add comments
COMMENT ON COLUMN chats.session_file_path IS 'Path to JSONL session file managed by Pi Agent';
COMMENT ON COLUMN chats.parent_chat_id IS 'Parent chat ID for branched conversations';
COMMENT ON COLUMN chats.branch_point_message_id IS 'Entry ID where branch occurred';
