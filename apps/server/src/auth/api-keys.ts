import * as crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import type { ApiKeyInfo } from './types.js';

// ============================================
// ENCRYPTION HELPERS
// ============================================

function getEncryptionKey(): string | null {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    console.error('WARNING: ENCRYPTION_KEY must be 32 bytes (64 hex chars). Generate with: openssl rand -hex 32');
    return null;
  }
  return key;
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('ENCRYPTION_KEY not configured');
  }
  const iv = crypto.randomBytes(16);
  const keyBuffer = Buffer.from(key, 'hex');
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error('ENCRYPTION_KEY not configured');
  }
  const [ivHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted text format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const keyBuffer = Buffer.from(key, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ============================================
// API KEY FUNCTIONS
// ============================================

interface SaveApiKeyResult {
  id: string;
  provider: string;
  keyPreview: string | null;
}

export async function saveApiKey(
  userId: string,
  provider: string,
  apiKey: string
): Promise<SaveApiKeyResult> {
  const encrypted = encrypt(apiKey);
  const preview = '...' + apiKey.slice(-4);
  
  const db = getDb();
  
  // Upsert
  const [existing] = await db.select()
    .from(schema.userApiKeys)
    .where(and(
      eq(schema.userApiKeys.userId, userId),
      eq(schema.userApiKeys.provider, provider)
    ));

  if (existing) {
    const [updated] = await db.update(schema.userApiKeys)
      .set({ keyEncrypted: encrypted, keyPreview: preview, isValid: true, lastUsedAt: new Date() })
      .where(eq(schema.userApiKeys.id, existing.id))
      .returning({ id: schema.userApiKeys.id, provider: schema.userApiKeys.provider, keyPreview: schema.userApiKeys.keyPreview });
    return updated;
  }

  const [created] = await db.insert(schema.userApiKeys)
    .values({ userId, provider, keyEncrypted: encrypted, keyPreview: preview })
    .returning({ id: schema.userApiKeys.id, provider: schema.userApiKeys.provider, keyPreview: schema.userApiKeys.keyPreview });
  
  return created;
}

export async function getApiKey(
  userId: string,
  provider: string
): Promise<string | null> {
  const db = getDb();
  const [result] = await db.select()
    .from(schema.userApiKeys)
    .where(and(
      eq(schema.userApiKeys.userId, userId),
      eq(schema.userApiKeys.provider, provider),
      eq(schema.userApiKeys.isValid, true)
    ));

  if (!result) return null;
  
  return decrypt(result.keyEncrypted);
}

export async function listApiKeys(userId: string): Promise<ApiKeyInfo[]> {
  const db = getDb();
  const keys = await db.select({
    id: schema.userApiKeys.id,
    provider: schema.userApiKeys.provider,
    keyPreview: schema.userApiKeys.keyPreview,
    isValid: schema.userApiKeys.isValid,
    createdAt: schema.userApiKeys.createdAt,
    lastUsedAt: schema.userApiKeys.lastUsedAt
  })
    .from(schema.userApiKeys)
    .where(eq(schema.userApiKeys.userId, userId));
  
  return keys;
}

export async function deleteApiKey(
  userId: string,
  provider: string
): Promise<void> {
  const db = getDb();
  await db.delete(schema.userApiKeys)
    .where(and(
      eq(schema.userApiKeys.userId, userId),
      eq(schema.userApiKeys.provider, provider)
    ));
}

export async function validateApiKey(
  userId: string,
  provider: string
): Promise<boolean> {
  const key = await getApiKey(userId, provider);
  return key !== null;
}
