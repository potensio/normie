import { eq, and } from 'drizzle-orm';
import { getDb, type DbClient } from '../db/index.js';
import * as schema from '../db/schema.js';
import { getContextMemories } from './memory-search.js';
import { APPLICATION_PROMPT } from '../prompts/system.js';
import { SkillService } from './skill-service.js';
import { buildSkillsPrompt } from './skill-prompt-builder.js';
import { getMessageAttachments, type SavedAttachment } from './file.service.js';
import { processAttachment, isVisionModel, type ProcessedContent } from './file-processor.js';

// Type for the database instance
type DbType = DbClient;

/**
 * Options for context building
 */
export interface ContextOptions {
  maxMessages?: number;
  model?: string;
  pendingAttachments?: Array<{
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    storagePath: string;
  }>;
}

/**
 * Result of building full context
 */
export interface FullContextResult {
  systemPrompt: string | null;
  messages: Array<{ 
    role: string; 
    content: string | Array<{ 
      type: 'text' | 'image'; 
      text?: string;
      data?: string;
      mimeType?: string;
    }> 
  }>;
  workspaceId: string | null;
}

/**
 * Build system context for a workspace
 * Loads SOUL.md, MEMORY.md, AGENTS.md, recent memories, and daily note
 * 
 * @param workspaceId - The workspace ID
 * @param db - Drizzle database instance
 * @returns Assembled system prompt
 */
export async function buildSystemContext(
  workspaceId: string,
  db: DbType
): Promise<string> {
  const parts: string[] = [];

  // 0. Application-level system prompt (always present, cannot be overridden)
  parts.push(APPLICATION_PROMPT);

  // 1. Load workspace files (SOUL.md, MEMORY.md, AGENTS.md)
  const files = await db.select()
    .from(schema.workspaceFiles)
    .where(eq(schema.workspaceFiles.workspaceId, workspaceId));

  const filesMap: Record<string, string> = {};
  for (const file of files) {
    filesMap[file.filename] = file.content;
  }

  // 2. SOUL.md - User's AI Persona/Identity (extends Delegate's personality)
  if (filesMap['SOUL.md']?.trim()) {
    parts.push(`## Your Identity\n\n${filesMap['SOUL.md'].trim()}`);
  }

  // 3. MEMORY.md - Persistent Knowledge
  if (filesMap['MEMORY.md']?.trim()) {
    parts.push(`## Persistent Memory\n\n${filesMap['MEMORY.md'].trim()}`);
  }

  // 4. AGENTS.md - Project Instructions
  if (filesMap['AGENTS.md']?.trim()) {
    parts.push(`## Project Instructions\n\n${filesMap['AGENTS.md'].trim()}`);
  }

  // 5. Recent important memories
  try {
    const contextData = await getContextMemories(workspaceId, {
      memoryLimit: 10,
      daysLimit: 7
    });

    if (contextData.memories?.length > 0) {
      const memoryText = contextData.memories
        .map(m => `- ${m.content}`)
        .join('\n');
      parts.push(`## Recent Context\n\n${memoryText}`);
    }

    if (contextData.dailyNotes?.length > 0) {
      const notesText = contextData.dailyNotes
        .map(n => `### ${n.noteDate}\n${n.content}`)
        .join('\n\n');
      parts.push(`## Recent Daily Notes\n\n${notesText}`);
    }
  } catch (error) {
    console.error('[CONTEXT] Error loading context memories:', error);
    // Continue without memories if there's an error
  }

  // 6. Today's daily note
  const today = new Date().toISOString().split('T')[0];
  const [todayNote] = await db.select()
    .from(schema.dailyNotes)
    .where(and(
      eq(schema.dailyNotes.workspaceId, workspaceId),
      eq(schema.dailyNotes.noteDate, today)
    ))
    .limit(1);

  if (todayNote?.content?.trim()) {
    parts.push(`## Today\n\n${todayNote.content.trim()}`);
  }

  // 7. Load workspace skills
  try {
    const skillService = new SkillService(db);
    const skills = await skillService.loadForPrompt(workspaceId);
    
    if (skills.length > 0) {
      const skillsPrompt = buildSkillsPrompt(skills);
      parts.push(skillsPrompt);
      console.log(`[CONTEXT] Loaded ${skills.length} skills`);
    }
  } catch (error) {
    console.error('[CONTEXT] Error loading skills:', error);
    // Continue without skills if there's an error
  }

  // Return assembled context (always has at least APPLICATION_PROMPT)
  return parts.join('\n\n---\n\n');
}

/**
 * Get workspace ID from chat ID
 * 
 * @param chatId - The chat ID
 * @param db - Drizzle database instance
 * @returns Workspace ID or null
 */
export async function getWorkspaceIdFromChat(
  chatId: string,
  db: DbType
): Promise<string | null> {
  if (!chatId) return null;
  
  try {
    const [chat] = await db.select()
      .from(schema.chats)
      .where(eq(schema.chats.id, chatId))
      .limit(1);
    
    return chat?.workspaceId || null;
  } catch (error) {
    console.error('[CONTEXT] Error getting workspace from chat:', error);
    return null;
  }
}

/**
 * Build full prompt with system context and conversation history
 * This enables project-level session memory that persists across providers
 * 
 * @param workspaceId - The workspace ID
 * @param chatId - The chat ID
 * @param currentMessage - The current user message
 * @param db - Drizzle database instance
 * @param options - Options for context building
 * @returns Object with systemPrompt, messages, and workspaceId
 */
export async function buildFullContext(
  workspaceId: string | null,
  chatId: string | null,
  currentMessage: string,
  db: DbType,
  options: ContextOptions = {}
): Promise<FullContextResult> {
  const { maxMessages = 20, model, pendingAttachments } = options;
  
  const result: FullContextResult = {
    systemPrompt: null,
    messages: [],
    workspaceId: null
  };

  // 1. Resolve workspaceId from chatId if not provided
  if (!workspaceId && chatId) {
    workspaceId = await getWorkspaceIdFromChat(chatId, db);
  }
  result.workspaceId = workspaceId;

  // 2. Build system prompt from workspace files
  if (workspaceId) {
    result.systemPrompt = await buildSystemContext(workspaceId, db);
  }

  // 3. Load conversation history from database
  if (chatId) {
    try {
      const chatMessages = await db.select()
        .from(schema.messages)
        .where(eq(schema.messages.chatId, chatId))
        .orderBy(schema.messages.createdAt)
        .limit(maxMessages);

      // Load attachments for all messages in one query
      const messageIds = chatMessages.map(m => m.id);
      const { inArray } = await import('drizzle-orm');
      const allAttachments: SavedAttachment[] = messageIds.length > 0 
        ? await db.select()
            .from(schema.messageAttachments)
            .where(inArray(schema.messageAttachments.messageId, messageIds))
        : [];
      
      // Group attachments by message ID
      const attachmentsByMessage = new Map<string, SavedAttachment[]>();
      for (const att of allAttachments) {
        const existing = attachmentsByMessage.get(att.messageId) || [];
        existing.push(att);
        attachmentsByMessage.set(att.messageId, existing);
      }

      // Convert to message format for AI
      for (const msg of chatMessages) {
        const msgAttachments = attachmentsByMessage.get(msg.id) || [];
        
        if (msgAttachments.length > 0 && model && isVisionModel(model)) {
          // Process attachments for vision-capable models
          const content = await buildMessageContent(msg.content, msgAttachments, model);
          result.messages.push({ role: msg.role, content });
        } else {
          // Plain text for non-vision models or messages without attachments
          result.messages.push({ role: msg.role, content: msg.content });
        }
      }

      console.log('[CONTEXT] Loaded', result.messages.length, 'messages from history');
    } catch (error) {
      console.error('[CONTEXT] Error loading chat history:', error);
    }
  }

  // 4. Add current message with pending attachments
  if (pendingAttachments && pendingAttachments.length > 0 && model && isVisionModel(model)) {
    const content = await buildMessageContent(currentMessage, pendingAttachments as SavedAttachment[], model);
    result.messages.push({ role: 'user', content });
  } else if (pendingAttachments && pendingAttachments.length > 0) {
    // Non-vision model - add text representation of attachments
    const attachmentInfo = pendingAttachments.map(a => `[Attached: ${a.originalName}]`).join('\n');
    result.messages.push({ role: 'user', content: `${attachmentInfo}\n\n${currentMessage}` });
  } else {
    result.messages.push({ role: 'user', content: currentMessage });
  }

  return result;
}

/**
 * Build message content array with text and images for vision models
 */
async function buildMessageContent(
  text: string,
  attachments: SavedAttachment[],
  model: string
): Promise<Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }>> {
  const content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }> = [];
  
  // Get attachments directory (relative to app data)
  const appDataPath = process.env.APP_DATA_PATH || process.cwd();
  const attachmentsDir = appDataPath;
  
  // Process each attachment
  for (const attachment of attachments) {
    try {
      const processed = await processAttachment(attachment, { model, attachmentsDir });
      
      for (const item of processed.contents) {
        if (item.type === 'image' && item.source) {
          content.push({
            type: 'image',
            data: item.source.data,
            mimeType: item.source.media_type
          });
        } else if (item.type === 'text' && item.text) {
          content.push({
            type: 'text',
            text: item.text
          });
        }
      }
    } catch (error) {
      console.error('[CONTEXT] Error processing attachment:', error);
      // Add fallback text
      content.push({
        type: 'text',
        text: `[Attachment: ${attachment.originalName} - could not be processed]`
      });
    }
  }
  
  // Add the text content at the end
  if (text) {
    content.push({ type: 'text', text });
  }
  
  return content;
}
