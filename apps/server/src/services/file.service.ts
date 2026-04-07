/**
 * File Service - Handles file attachment metadata in database
 */

import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';

export interface SavedAttachment {
  id: string;
  messageId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  createdAt: Date;
}

export interface AttachmentInput {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
}

/**
 * Save attachment metadata to database
 */
export async function saveAttachmentMetadata(
  db: NodePgDatabase<typeof schema>,
  messageId: string,
  attachment: AttachmentInput
): Promise<SavedAttachment> {
  const [saved] = await db.insert(schema.messageAttachments)
    .values({
      messageId,
      ...attachment
    })
    .returning();
  
  return saved;
}

/**
 * Save multiple attachments at once
 */
export async function saveAttachmentsMetadata(
  db: NodePgDatabase<typeof schema>,
  messageId: string,
  attachments: AttachmentInput[]
): Promise<SavedAttachment[]> {
  if (attachments.length === 0) return [];
  
  const saved = await db.insert(schema.messageAttachments)
    .values(attachments.map(a => ({ messageId, ...a })))
    .returning();
  
  return saved;
}

/**
 * Get all attachments for a message
 */
export async function getMessageAttachments(
  db: NodePgDatabase<typeof schema>,
  messageId: string
): Promise<SavedAttachment[]> {
  return db.select()
    .from(schema.messageAttachments)
    .where(eq(schema.messageAttachments.messageId, messageId));
}

/**
 * Get all attachments for a chat
 */
export async function getChatAttachments(
  db: NodePgDatabase<typeof schema>,
  chatId: string
): Promise<SavedAttachment[]> {
  const result = await db
    .select({
      id: schema.messageAttachments.id,
      messageId: schema.messageAttachments.messageId,
      filename: schema.messageAttachments.filename,
      originalName: schema.messageAttachments.originalName,
      mimeType: schema.messageAttachments.mimeType,
      size: schema.messageAttachments.size,
      storagePath: schema.messageAttachments.storagePath,
      createdAt: schema.messageAttachments.createdAt
    })
    .from(schema.messageAttachments)
    .innerJoin(
      schema.messages,
      eq(schema.messageAttachments.messageId, schema.messages.id)
    )
    .where(eq(schema.messages.chatId, chatId));
  
  return result;
}

/**
 * Delete attachments for a message
 */
export async function deleteMessageAttachments(
  db: NodePgDatabase<typeof schema>,
  messageId: string
): Promise<void> {
  await db.delete(schema.messageAttachments)
    .where(eq(schema.messageAttachments.messageId, messageId));
}