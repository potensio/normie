import { pgTable, uuid, varchar, text, boolean, timestamp, integer, jsonb, inet, date, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// USERS
// ============================================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 100 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true })
}, (table) => [
  index('idx_users_email').on(table.email)
]);

// ============================================
// SESSIONS (HTTP-only cookie based)
// ============================================
export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_sessions_user').on(table.userId),
  index('idx_sessions_expires').on(table.expiresAt)
]);

// ============================================
// REFRESH TOKENS (Legacy - will be removed)
// ============================================
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  deviceInfo: jsonb('device_info').$type<Record<string, unknown>>(),
  ipAddress: inet('ip_address'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_refresh_tokens_user').on(table.userId),
  index('idx_refresh_tokens_hash').on(table.tokenHash)
]);

// ============================================
// USER API KEYS
// ============================================
export const userApiKeys = pgTable('user_api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull(),
  keyEncrypted: text('key_encrypted').notNull(),
  keyPreview: varchar('key_preview', { length: 20 }),
  isValid: boolean('is_valid').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true })
}, (table) => [
  index('idx_api_keys_user_provider').on(table.userId, table.provider)
]);

// ============================================
// USER PREFERENCES
// ============================================
export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  defaultProvider: varchar('default_provider', { length: 50 }).default('claude'),
  defaultModel: varchar('default_model', { length: 100 }),
  thinkingMode: varchar('thinking_mode', { length: 20 }).default('normal'),
  theme: varchar('theme', { length: 20 }).default('dark'),
  settings: jsonb('settings').default({}).$type<Record<string, unknown>>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

// ============================================
// WORKSPACES
// ============================================
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_workspaces_owner').on(table.ownerId)
]);

// ============================================
// WORKSPACE MEMBERS
// ============================================
export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_workspace_members_workspace').on(table.workspaceId),
  index('idx_workspace_members_user').on(table.userId)
]);

// ============================================
// WORKSPACE FILES (SOUL.md, MEMORY.md, etc.)
// ============================================
export const workspaceFiles = pgTable('workspace_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 100 }).notNull(),
  content: text('content').notNull(),
  version: integer('version').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_workspace_files_workspace').on(table.workspaceId),
  unique('unique_workspace_file').on(table.workspaceId, table.filename)
]);

// ============================================
// CHATS
// ============================================
export const chats = pgTable('chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  title: varchar('title', { length: 255 }),
  provider: varchar('provider', { length: 50 }).notNull(),
  model: varchar('model', { length: 100 }),
  sessionId: varchar('session_id', { length: 255 }),
  sessionProvider: varchar('session_provider', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>()
}, (table) => [
  index('idx_chats_workspace').on(table.workspaceId),
  index('idx_chats_user_updated').on(table.userId, table.updatedAt)
]);

// ============================================
// MESSAGES
// ============================================
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_messages_chat').on(table.chatId, table.createdAt)
]);

// ============================================
// MEMORIES
// ============================================
export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  memoryType: varchar('memory_type', { length: 20 }).default('note'),
  sourceChatId: uuid('source_chat_id').references(() => chats.id),
  importance: integer('importance').default(5),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  // Note: vector column added separately via raw SQL after drizzle push
}, (table) => [
  index('idx_memories_workspace').on(table.workspaceId),
  index('idx_memories_workspace_created').on(table.workspaceId, table.createdAt)
]);

// ============================================
// DAILY NOTES
// ============================================
export const dailyNotes = pgTable('daily_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  noteDate: date('note_date').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_daily_notes_workspace_date').on(table.workspaceId, table.noteDate),
  unique('unique_daily_note').on(table.workspaceId, table.noteDate)
]);

// ============================================
// WORKSPACE INVITES
// ============================================
export const workspaceInvites = pgTable('workspace_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  inviterId: uuid('inviter_id').notNull().references(() => users.id),
  inviteeEmail: varchar('invitee_email', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).default('member'),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_workspace_invites_token').on(table.token)
]);

// ============================================
// RELATIONS
// ============================================
export const usersRelations = relations(users, ({ many, one }) => ({
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId]
  }),
  apiKeys: many(userApiKeys),
  workspaces: many(workspaces),
  refreshTokens: many(refreshTokens),
  sessions: many(sessions)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id]
  })
}));

export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id]
  }),
  members: many(workspaceMembers),
  files: many(workspaceFiles),
  chats: many(chats),
  memories: many(memories),
  dailyNotes: many(dailyNotes),
  invites: many(workspaceInvites)
}));

export const chatsRelations = relations(chats, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [chats.workspaceId],
    references: [workspaces.id]
  }),
  user: one(users, {
    fields: [chats.userId],
    references: [users.id]
  }),
  messages: many(messages)
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id]
  })
}));
