import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  inet,
  date,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================
// USERS
// ============================================
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 100 }),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [index("idx_users_email").on(table.email)],
);

// ============================================
// SESSIONS (HTTP-only cookie based)
// ============================================
export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 45 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_sessions_user").on(table.userId),
    index("idx_sessions_expires").on(table.expiresAt),
  ],
);

// ============================================
// REFRESH TOKENS (Legacy - will be removed)
// ============================================
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    deviceInfo: jsonb("device_info").$type<Record<string, unknown>>(),
    ipAddress: inet("ip_address"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_refresh_tokens_user").on(table.userId),
    index("idx_refresh_tokens_hash").on(table.tokenHash),
  ],
);

// ============================================
// SYSTEM API KEYS
// ============================================
// Keys owned by the system/owner, not per-user.
// Used for built-in providers like Normie AI.
export const systemApiKeys = pgTable(
  "system_api_keys",
  {
    provider: varchar("provider", { length: 50 }).primaryKey(),
    keyEncrypted: text("key_encrypted").notNull(),
    keyPreview: varchar("key_preview", { length: 20 }),
    baseUrl: text("base_url"), // Optional: for custom endpoints (e.g., Bedrock)
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

// ============================================
// USER API KEYS
// ============================================
export const userApiKeys = pgTable(
  "user_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull(),
    keyEncrypted: text("key_encrypted").notNull(),
    keyPreview: varchar("key_preview", { length: 20 }),
    isValid: boolean("is_valid").default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_api_keys_user_provider").on(table.userId, table.provider),
  ],
);

// ============================================
// USER PREFERENCES
// ============================================
export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultProvider: varchar("default_provider", { length: 50 }).default(
    "claude",
  ),
  defaultModel: varchar("default_model", { length: 100 }),
  thinkingMode: varchar("thinking_mode", { length: 20 }).default("normal"),
  theme: varchar("theme", { length: 20 }).default("dark"),
  settings: jsonb("settings").default({}).$type<Record<string, unknown>>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ============================================
// WORKSPACES
// ============================================
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_workspaces_owner").on(table.ownerId)],
);

// ============================================
// WORKSPACE MEMBERS
// ============================================
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_workspace_members_workspace").on(table.workspaceId),
    index("idx_workspace_members_user").on(table.userId),
  ],
);

// ============================================
// WORKSPACE FILES (SOUL.md, MEMORY.md, etc.)
// ============================================
export const workspaceFiles = pgTable(
  "workspace_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 100 }).notNull(),
    content: text("content").notNull(),
    version: integer("version").default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_workspace_files_workspace").on(table.workspaceId),
    unique("unique_workspace_file").on(table.workspaceId, table.filename),
  ],
);

// ============================================
// CHATS
// ============================================
// Note: Self-referential FK for parentChatId is handled via raw SQL in migration
// because Drizzle has issues with self-referencing in the table definition
export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    title: varchar("title", { length: 255 }),
    provider: varchar("provider", { length: 50 }).notNull(),
    model: varchar("model", { length: 100 }),

    // Session file path for Pi Agent JSONL session
    sessionFilePath: text("session_file_path"),

    // Branch tracking for conversation branching
    // Note: FK constraint added via migration, not here due to self-reference
    parentChatId: uuid("parent_chat_id"),
    branchPointMessageId: text("branch_point_message_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
  },
  (table) => [
    index("idx_chats_workspace").on(table.workspaceId),
    index("idx_chats_user_updated").on(table.userId, table.updatedAt),
    index("idx_chats_parent_chat_id").on(table.parentChatId),
    index("idx_chats_session_file_path").on(table.sessionFilePath),
  ],
);

// ============================================
// MESSAGES
// ============================================
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_messages_chat").on(table.chatId, table.createdAt)],
);

// ============================================
// MESSAGE ATTACHMENTS
// ============================================
export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(), // Generated unique filename
    originalName: varchar("original_name", { length: 255 }).notNull(), // User's original filename
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    size: integer("size").notNull(), // Size in bytes
    storagePath: text("storage_path").notNull(), // Relative path from attachments dir
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_message_attachments_message").on(table.messageId)],
);

// ============================================
// MEMORIES
// ============================================
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    memoryType: varchar("memory_type", { length: 20 }).default("note"),
    sourceChatId: uuid("source_chat_id").references(() => chats.id),
    importance: integer("importance").default(5),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Note: vector column added separately via raw SQL after drizzle push
  },
  (table) => [
    index("idx_memories_workspace").on(table.workspaceId),
    index("idx_memories_workspace_created").on(
      table.workspaceId,
      table.createdAt,
    ),
  ],
);

// ============================================
// DAILY NOTES
// ============================================
export const dailyNotes = pgTable(
  "daily_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    noteDate: date("note_date").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_daily_notes_workspace_date").on(
      table.workspaceId,
      table.noteDate,
    ),
    unique("unique_daily_note").on(table.workspaceId, table.noteDate),
  ],
);

// ============================================
// WORKSPACE SKILLS
// ============================================
export const workspaceSkills = pgTable(
  "workspace_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    description: text("description").notNull(),
    filePath: text("file_path").notNull(), // Path to SKILL.md on disk
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_workspace_skills_workspace").on(table.workspaceId),
    unique("unique_workspace_skill_name").on(table.workspaceId, table.name),
  ],
);

// ============================================
// WORKSPACE SKILL FILES
// ============================================
export const workspaceSkillFiles = pgTable(
  "workspace_skill_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => workspaceSkills.id, { onDelete: "cascade" }),
    relativePath: varchar("relative_path", { length: 255 }).notNull(),
    filePath: text("file_path").notNull(), // Absolute path on disk
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_workspace_skill_files_skill").on(table.skillId),
    unique("unique_skill_file_path").on(table.skillId, table.relativePath),
  ],
);

// ============================================
// WORKSPACE INVITES
// ============================================
export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id),
    inviteeEmail: varchar("invitee_email", { length: 255 }).notNull(),
    role: varchar("role", { length: 20 }).default("member"),
    token: varchar("token", { length: 255 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_workspace_invites_token").on(table.token)],
);

// ============================================
// RELATIONS
// ============================================
export const usersRelations = relations(users, ({ many, one }) => ({
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
  }),
  apiKeys: many(userApiKeys),
  workspaces: many(workspaces),
  refreshTokens: many(refreshTokens),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  members: many(workspaceMembers),
  files: many(workspaceFiles),
  chats: many(chats),
  memories: many(memories),
  dailyNotes: many(dailyNotes),
  invites: many(workspaceInvites),
  skills: many(workspaceSkills),
}));

export const chatsRelations = relations(chats, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [chats.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  // Self-referential relation for conversation branches
  parentChat: one(chats, {
    fields: [chats.parentChatId],
    references: [chats.id],
    relationName: "chatBranches",
  }),
  branches: many(chats, {
    relationName: "chatBranches",
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
  attachments: many(messageAttachments),
}));

export const messageAttachmentsRelations = relations(
  messageAttachments,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageAttachments.messageId],
      references: [messages.id],
    }),
  }),
);

// ============================================
// SKILL RELATIONS
// ============================================
export const workspaceSkillsRelations = relations(
  workspaceSkills,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [workspaceSkills.workspaceId],
      references: [workspaces.id],
    }),
    files: many(workspaceSkillFiles),
  }),
);

export const workspaceSkillFilesRelations = relations(
  workspaceSkillFiles,
  ({ one }) => ({
    skill: one(workspaceSkills, {
      fields: [workspaceSkillFiles.skillId],
      references: [workspaceSkills.id],
    }),
  }),
);
